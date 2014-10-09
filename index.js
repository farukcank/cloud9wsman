var router = require("./router");
var server = require("./server");
require('./userHandlers').register(router);
require('./workspaceHandlers').register(router);

server.start(process.env.PORT, '0.0.0.0', router);