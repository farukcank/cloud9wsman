var config = require('config');
var U = require('./handlerUtility');
var router = require("./router");
var server = require("./server");
var httpProxy = require('http-proxy');
var workspaceHandlers = require('./workspaceHandlers');
var userHandlers = require('./userHandlers');
workspaceHandlers.register(router);
userHandlers.register(router);

var proxy = httpProxy.createProxyServer({});
proxy.on('error', function(e) {
    console.error(e.stack);
});
server.start(U.getApplicationPort(), config.get("application.host"), router, workspaceHandlers.workspaceProxyFunction(proxy));
workspaceHandlers.setup();