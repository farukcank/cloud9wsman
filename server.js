var http = require("http");
var serveStatic = require('serve-static');


function startServer(port, host, router){
    var serve = serveStatic('static/', {'index': ['index.html', 'index.htm']});
    
    function requestHandler(request, response){
        function rout(){
            router.route(request)(request, response);
        }
        //setTimeout(function(){serve(request, response, rout);},500);
        serve(request, response, rout);
    }
    http.createServer(requestHandler).listen(port, host);
    console.log("Server started listening on "+host+":"+port);
}

exports.start = startServer;