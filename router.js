
var url = require("url");
var getHandlers = {};
var postHandlers = {};

function notFoundHandler(request, response){
    response.writeHead(404, {"Content-Type": "text/plain"});
    response.write("Not found");
    response.end();    
}

function todoHandler(request, response){
    response.writeHead(200, {"Content-Type": "text/plain"});
    response.write("Hello World");
    response.end(); 
}

function route(request){
    var pathname = url.parse(request.url).pathname;
    var handler;
    if (request.method=="POST") {
        handler = postHandlers[pathname];
    }else{
        handler = getHandlers[pathname];
    }
    if (handler)
        return handler;
    else
        return notFoundHandler;
}

function registerGet(url, handler){
    getHandlers[url] = handler;
}

function registerPost(url, handler){
    postHandlers[url] = handler;
}

exports.route = route;
exports.register = registerGet;
exports.registerGet = registerGet;
exports.registerPost = registerPost;
exports.notFoundHandler = notFoundHandler;
exports.todoHandler = todoHandler;