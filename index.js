var io = require('socket.io-client');
var _ = require('lodash');
var request = require('request');
var ipfs = require('ipfs-js');

function uuid() {
    function _p8(s) {
        var p = (Math.random().toString(16)+"000000000").substr(2,8);
        return s ? "-" + p.substr(0,4) + "-" + p.substr(4,4) : p ;
    }
    return _p8() + _p8(true) + _p8(true) + _p8();
}

function proceed () {
    var timer;
    var client = {};
    client.name=uuid();

    var socket = io('http://api.computes.io', {reconnect: true});
    socket.connect();
    socket.on('connect', function () {
      console.log(client.name + ': Connected');
      socket.emit('storeClientInfo', { customId: client.name, domainKey: ["computes"] });
      socket.on('message', function (msg) {
        console.log(msg);
      });
    });

    function requestJob(){

      var post={
        url: 'http://api.computes.io/jobs/requestJob',
        form: {
          domain: ["computes"],
          client: client
        },
        auth: { 'kazi-token':'YOUR-SECRET-TOKEN' }
      };

      console.log(client.name +': Requesting new job...');

      request.post({url:post.url, form: post.form, cache: false, headers: post.auth}, function optionalCallback(err, httpResponse, job) {
        // console.log(job);
        if (err) {
          console.log('requestJob error');
          timer = setTimeout(function(){
            requestJob();
          },1000);
        } else {
          // console.log('done'+JSON.stringify(job)+'');
          if(_.size(job)){
            if (Object.keys(job).length !== 0){
              // console.log(JSON.stringify(job));
            }

            if(_.has(job.name)){
              console.log(client.name +': Job allocated [JOB:'+job.id+']');
              runJob(job,function(job){
                console.log(JSON.stringify(job));
              });
            }
            else{
              console.log(client.name +': No jobs...waiting');
              timer = setTimeout(function(){
                requestJob();
              },1000);
            }
          } else {
            console.log('requestJob timed out');
            timer = setTimeout(function(){
              requestJob();
            },1000);
          }
        }
      });
    }

    function runJob(job){
      console.log(job);
      if(job && _.has(job.name)){
        var result=job;
        console.log(client.name +': Running job [JOB:'+job.id+']');
        var terminateJobAfter=job.terminateJobAfter || (5*60*1000); //5 minutes
        timer = setTimeout(function(){
          console.log(client.name +': Forcefully Teminating [JOB:'+job.id+']' );
          finishJob(job,result);
        },terminateJobAfter);
        var payload = job.data;
        if(payload && (payload.operation || payload.command)){
          var command = payload.command;
          var operation = payload.operation;
          var data = payload.data;
          console.log('> command:'+command+'');
          console.log('> operation:'+operation+'');
          console.log('> data:'+data+'');

          if(operation){
            var expression = /https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,}/;
            var regex = new RegExp(expression);

            // check if operation is IPFS. If so, fetch operation
            var expression = /ipfs:\/\//;
            var ipfsRegex = new RegExp(expression);

            // check if operation is NPM. If so, fetch operation
            var expression = /npm:\/\//;
            var npmRegex = new RegExp(expression);

            if (operation.match(regex) )
             {
               $.ajax({
                 cache: false,
                 type:'GET',
                 url: operation,
                 success: function(msg) {
                   var test = eval(msg);
                   if (data){
                     result = test(data);
                   } else {
                     result = test();
                   }
                   console.log('operation: ' + JSON.stringify(msg)+'');
                   console.log('data: ' + JSON.stringify(data)+'');
                   console.log('result: ' + JSON.stringify({result:result})+'');

                  result = {result:result};
                  finishJob(job,result,function(){

                  });

                 }
               });

             } else if (operation.match(ipfsRegex)) {
               console.log("operation is ipfs. fetching javascript");
               var filename = operation.split("//");
               var filehash = filename[1];
               ipfs.cat(filehash, function(err, buffer) {
                 if (err) throw err;
                 // console.log("operation", buffer.toString());
                 var test = eval(buffer.toString());
                 if (data){
                   var result = test(data);
                 } else {
                   var result = test();
                 }

                 result = {result:result};

                 console.log('operation: ' + JSON.stringify(operation));
                 console.log('data: ' + JSON.stringify(data));
                 console.log('result: ' + JSON.stringify(result));

                 finishJob(job,result,function(){

                 });

               });

             } else if (operation.match(npmRegex)) {
                 console.log("operation is NPM module. fetching javascript");
                 var moduleArray = operation.split("//");
                 var moduleName = moduleArray[1];
                 var moduleParts = moduleName.split('@');
                 var moduleUrl = "https://computes-browserify-cdn.herokuapp.com/debug-bundle/" + moduleName;
                 // var moduleUrl = "https://wzrd.in/debug-bundle/" + moduleName;
                 request(moduleUrl, function (error, response, body) {
                   // console.log(response);
                   if (!error && response.statusCode == 200) {
                     body = body + ' ("' + moduleParts[0] + '")';
                     var test = eval(body);
                     if (data){
                       var result = test(data);
                     } else {
                       var result = test();
                     }

                     result = {result:result};

                     console.log('operation: ' + JSON.stringify(operation));
                     console.log('data: ' + JSON.stringify(data));
                     console.log('result: ' + JSON.stringify(result));

                     finishJob(job,result,function(){

                     });

                   }
                 });

             } else {

               var test = eval(operation);
               if (data){
                 result = test(data);
               } else {
                 result = test();
               }
               console.log('operation: ' + JSON.stringify(operation)+'');
               console.log('data: ' + JSON.stringify(data)+'');
               console.log('result: ' + JSON.stringify({result:result})+'');

              result = {result:result};
              finishJob(job,result,function(){

              });

             }
          }
        }
      }
    }

    function finishJob(job,result,callback){

      callback=callback || function(res){};
      console.log(client.name +': Finishing job...');

      request.post({
        url: 'http://api.computes.io/jobs/finishJobs',
        form: {client:client,jobs:job,result:result},
        cache: false,
        headers: { 'kazi-token':'YOUR-SECRET-TOKEN' }
      }, function optionalCallback(err, httpResponse, body) {
        if (err) {
          console.log('finishJob error');
          timer = setTimeout(function(){
            requestJob();
          },1000);
        } else {
          callback();
          timer = setTimeout(function(){
            requestJob();
          },1000);

        }
      });
    }
    requestJob();
}
proceed();
