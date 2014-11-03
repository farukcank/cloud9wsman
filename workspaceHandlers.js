var config = require('config');
var U = require('./handlerUtility');
var dockerService = require("./dockerService");
var Q = require("q");
var db = require("./db");
var session = require("./session");
var auth = require("./auth");
var url = require('url');
var net = require('net');
var httpProxy = require('http-proxy');

function replaceParameters(str, replacements){
    return str.replace(/{([a-zA-Z_0-9\.]+)}/g, function(match, key) { 
      return typeof replacements[key] != 'undefined'
        ? replacements[key]
        : match
      ;
    });
}

function putWorkspaceState(workspace){
    return dockerService.container.inspect(workspace.identifier).then(function(inspectResult){
        workspace.state = inspectResult.State;
        if (inspectResult.NetworkSettings)
            workspace.ipaddress = inspectResult.NetworkSettings.IPAddress;
        return workspace;
    });
}
function putWorkspaceStates(workspaces){
    var works = [];
    var workspaceCount = workspaces.length;
    for(var i = 0;i<workspaceCount;i++){
        works.push(putWorkspaceState(workspaces[i]));
    }
    return Q.all(works);
}

function ownWorkspaceOrAdmin(request){
    return Q.all([U.parseJSONBody(request), session.getSession(request)]).spread(function(workspace, session) {
        return db.workspaces.getById(workspace.id).then(function (ws){
            var hasAdminRole = auth.userHasRole('admin');
            var hasSameUsername = auth.userHasUsername(ws.username);
            var requirement = auth.userHasSome([hasAdminRole,hasSameUsername]);
            return Q(session).then(auth.requireUserF(requirement)).then(function(user){
                return {"session":session,"user":user,"requestWorkspace":workspace,"dbWorkspace":ws};
            });    
        });
    });
}

function listWorkspacesHandler(request, response){
    session.getSession(request)
        .then(auth.requireUser('admin'))
        .then(db.workspaces.list)
        .then(putWorkspaceStates)
        .done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}

function listMyWorkspacesHandler(request, response){
    session.getSession(request).then(auth.requireUser()).then(function(user){
        return db.workspaces.listByUsername(user.username);
    }).then(putWorkspaceStates).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}
function isEmptyString(str){
    return str===undefined || str === null || str ==='';
}
function decideUsername(user, givenUsername, defaultUsername){
    if (isEmptyString(givenUsername))
        return Q(defaultUsername);
    else if (auth.userHasRole('admin')(user)){
        return db.users.getByUsername(givenUsername).then(function(user){
            return Q(givenUsername);
        }).catch(function(err){
            if (err.code=='userdoesnotexist'){
                return Q(defaultUsername);
            }else{
                return Q.reject(err);
            }
        });
    }else{
        return Q(defaultUsername);
    }
}
function createWorkspaceHandler(request, response){
    Q.all([U.parseJSONBody(request), session.getSession(request).then(auth.requireUser('user'))]).spread(function(workspace, user) {
        return db.workspaces.findAvailablePort(11000,15000).then(function(p){
            var port = p.toString();
            function repl(s){
                return replaceParameters(s,{"port":port,"workspaceId":workspace.id,"portAssignmentServerPort":config.get('baseContainer.portAssignmentServerPort')});
            }
            return dockerService.container.create(config.get('baseContainer.name'), config.get('baseContainer.command').map(repl), [port]).then(function(containerId){
                workspace.identifier = containerId;
                workspace.port = port;
                return decideUsername(user, workspace.username, user.username).then(function(username){
                    workspace.username = username;
                    return db.workspaces.create(workspace);
                }).catch(function(err){
                    dockerService.container.remove(containerId);
                    return Q.reject(err);
                });
            }).then(putWorkspaceState);
        });
    }).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}
function workspaceStateChangingHandler(request, response, callback){
    ownWorkspaceOrAdmin(request).then(function(r){
        var ws = r.dbWorkspace;
        return callback(ws).then(putWorkspaceState.bind(null,ws));
    }).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}
function startWorkspaceHandler(request, response){
    workspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.start(ws.identifier,[ws.port.toString()]);
    });
}
function stopWorkspaceHandler(request, response){
    workspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.stop(ws.identifier,[ws.port.toString()]);
    });
}
function killWorkspaceHandler(request, response){
    workspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.kill(ws.identifier,[ws.port.toString()]);
    });
}
function restartWorkspaceHandler(request, response){
    workspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.restart(ws.identifier,[ws.port.toString()]);
    });
}
function pauseWorkspaceHandler(request, response){
    workspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.pause(ws.identifier,[ws.port.toString()]);
    });
}
function resumeWorkspaceHandler(request, response){
    workspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.unpause(ws.identifier,[ws.port.toString()]);
    });
}
function deleteWorkspaceHandler(request, response){
    ownWorkspaceOrAdmin(request).then(function(r){
        var ws = r.dbWorkspace;
        return dockerService.container.remove(ws.identifier).then(db.workspaces.delete.bind(null,ws));
    }).done(U.jsonEmptyResultHandler(response), U.jsonErrorHandler(response));
}
function updateWorkspaceHandler(request, response){
    ownWorkspaceOrAdmin(request).then(function(r){
        var ws = r.dbWorkspace;
        var workspace = r.requestWorkspace;
        ws.name = workspace.name;
        ws.description = workspace.description;
        return decideUsername(r.user,workspace.username,ws.username).then(function(username){
            ws.username = username;
            return db.workspaces.update(ws).then(putWorkspaceState);
        });
    }).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}
function extractHost(request){
    var index = request.headers.host.indexOf(':');
    if (index>=0){
        return request.headers.host.substring(0,index);
    }
    return request.headers.host;
}
function goToWorkspaceHandler(request, response){
    var r = url.parse(request.url, true);
    var workspaceId = r.query.id;
    db.workspaces.getById(workspaceId).done(function (workspace){
        var targetAddress = replaceParameters(config.get('workspaceAddress'), {"workspace.id":workspaceId,"workspace.port":workspace.port,"application.host":extractHost(request),"application.port":U.getApplicationPort()});
        response.writeHead(302, {'Location': targetAddress});
        response.end();
    });
}
function basicAuthenticate(req){
    if (req.headers.authorization && req.headers.authorization.indexOf('Basic ')===0){
        var s = new Buffer(req.headers.authorization.substring(6), 'base64').toString('ascii');
        var i = s.indexOf(':');
        if (i>=0){
            var username = s.substring(0,i);
            var password = s.substring(i+1);
            return auth.checkLogin({"username":username,"password":password});
        }
    }
    var error = new Error("Unauthorized");
    error.code = "unauthroized";
    return Q.reject(error);
}
function checkWorkspaceOwner(arr){
    var user = arr[0];
    var workspace = arr[1];
    if (workspace.username==user.username || auth.userHasRole('admin')(user)){
        return Q(arr);
    }else{
        var error = new Error("Unauthorized");
        error.code = "unauthroized";
        return Q.reject(error);
    }
}
function workspaceProxyFunction(proxy){
    var identifierRegex = /^([$a-z][0-9a-z]{3,9})\./;
    return function(req, res, next) {
        var match = identifierRegex.exec(req.headers.host);
        if (match){
            req.pause();
            Q.all([basicAuthenticate(req),db.workspaces.getById(match[1])]).then(checkWorkspaceOwner).spread(function(user, workspace){
                req.resume();
                var tar = 'http://'+config.get('docker.address')+":"+workspace.port;
                proxy.web(req, res, {
                    target: tar
                });
            }).done(null,function(err){
                req.resume();
                if (err.code=='unauthroized' || err.code=='invalidusernameorpassword' || err.code == 'invalidUsernameOrPassword'){
                    res.writeHead(401, {"Content-Type":"text/plain","WWW-Authenticate":"Basic realm=\""+match[1]+"\""});
                    res.write("Unauthorized");
                    res.end();
                }else{
                    res.writeHead(500, {"Content-Type":"text/plain"});
                    res.write(err.message);
                    res.end();
                }
                console.log(err.stack);
            });
        }else{
            next();
        }
    };
}
function findRunningWorkspaces(){
    return db.workspaces.list().then(putWorkspaceStates).then(function(workspaces){
        return Q(workspaces.filter(function(ws){if (ws.state.Running && !ws.state.Paused)return true; else return false;}));
    });
}
var sockets = {};
var proxies = {};


function assignPort(workspace){
    return findPort(workspace).then(function(port){
        var proxy = proxies[workspace.id];
        if (proxy){
            proxy.close();
        }
        proxy = httpProxy.createProxyServer({target:'http://'+workspace.ipaddress+':'+port});
        proxy.on('error', function(e) {
            console.error(e.stack);
        });
        proxy.listen(port);
        proxies[workspace.id] = proxy;
        return Q(port);
    });
}
function findPort(workspace){
    var deferred = Q.defer();
    findFreePort(20000, 64000, "localhost", function (err, port) {	
        if (err)
            deferred.reject(err);
        else
            deferred.resolve(port);
	});
	return deferred.promise;
}
function asyncRepeat(callback, onDone) {
    callback(function() {
        asyncRepeat(callback, onDone);
    }, onDone);
}

function findFreePort(start, end, hostname, callback) {
    var pivot = Math.floor(Math.random() * (end - start)) + start;
    var port = pivot;
    asyncRepeat(function(next, done) {
        var stream = net.createConnection(port, hostname);
        stream.on("connect", function() {
            stream.destroy();
            port++;
            if (port > end) port = start;
            if (port == pivot) done("Could not find free port.");
            next();
        });
        stream.on("error", function() {
            done();
        });
    }, function(err) {
        callback(err, port);
    });
}
function checkPortAssignmentSocket(workspace) {
    var socket = sockets[workspace.id];
    if (!socket) {
        var currentData = "";
        var processData = function() {
            var index = currentData.indexOf('\n');
            if (index >= 0) {
                var action = currentData.substring(0, index);
                if (action == 'newportrequired') {
                    assignPort(workspace).done(function(port) {
                        socket.write('port:'+port+'\n');
                        console.log("Port "+port+" assigned to "+workspace.id);
                    });
                }
                currentData = currentData.substring(index + 1);
                processData();
            }
        };
        socket = net.connect({
            port: config.get('baseContainer.portAssignmentServerPort'),
            host: workspace.ipaddress
        },function(){
            console.log("Connected port assignment: "+workspace.id);
            console.log('HOST:'+config.get("application.host"));
            socket.write('host:'+config.get("application.host")+'\n');
        });
        socket.on('data', function(data) {
            currentData = currentData + data;
            processData();
        });
        socket.on('end', function() {
            delete sockets[workspace.id];
            console.log("Disconnected port assignment: "+workspace.id);
        });
        sockets[workspace.id] = socket;
    }
    return Q(true);
}
function checkPortAssignmentSockets(){
    return findRunningWorkspaces().then(function(workspaces){
        return Q.all(workspaces.map(checkPortAssignmentSocket));
    });
}
function checkPortAssignmentSocketsPeriodically(){
    function per(){
        checkPortAssignmentSockets().done(function(){
            setTimeout(per, 5000);
        },function(err){
            console.error(err);
            setTimeout(per, 5000);
        });
    }
    setTimeout(per, 0);
}
function setup(){
    checkPortAssignmentSocketsPeriodically();
}
exports.register = function(router){
    router.register("/workspaces/list",listWorkspacesHandler);
    router.register("/workspaces/listmy",listMyWorkspacesHandler);
    router.register("/workspaces/go",goToWorkspaceHandler);
    router.registerPost("/workspaces/create",createWorkspaceHandler);
    router.registerPost("/workspaces/delete",deleteWorkspaceHandler);
    router.registerPost("/workspaces/update",updateWorkspaceHandler);
    router.registerPost("/workspaces/start",startWorkspaceHandler);
    router.registerPost("/workspaces/stop",stopWorkspaceHandler);
    router.registerPost("/workspaces/kill",killWorkspaceHandler);
    router.registerPost("/workspaces/restart",restartWorkspaceHandler);
    router.registerPost("/workspaces/pause",pauseWorkspaceHandler);
    router.registerPost("/workspaces/resume",resumeWorkspaceHandler);
};
exports.workspaceProxyFunction=workspaceProxyFunction;
exports.setup=setup;