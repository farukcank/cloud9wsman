var config = require('config');
var U = require('./handlerUtility');
var dockerService = require("./dockerService");
var Q = require("q");
var db = require("./db");
var session = require("./session");
var auth = require("./auth");
var url = require('url');
function putWorkspaceState(workspace){
    return dockerService.container.inspect(workspace.identifier).then(function(inspectResult){
        workspace.state = inspectResult.State;
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

function createWorkspaceHandler(request, response){
    Q.all([U.parseJSONBody(request), session.getSession(request).then(auth.requireUser('user'))]).spread(function(workspace, user) {
        return db.workspaces.findAvailablePort(11000,15000).then(function(p){
            var port = p.toString();
            return dockerService.container.create("cank/cloud9:v1", ["/cloud9.sh", port], [port]).then(function(containerId){
                workspace.identifier = containerId;
                workspace.username = user.username;
                workspace.port = port;
                return db.workspaces.create(workspace);
            }).then(putWorkspaceState);
        });
    }).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}
function workspaceStateChangingHandler(request, response, callback){
    ownWorkspaceOrAdmin(request).then(function(r){
        var ws = r.dbWorkspace;
        return callback(ws).then(putWorkspaceState.bind(null,ws)).get('state');
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
        return db.workspaces.update(ws).then(putWorkspaceState);
    }).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}
function goToWorkspaceHandler(request, response){
    var r = url.parse(request.url, true);
    var workspaceId = r.query.id;
    var replacements = {"workspace.id":workspaceId,"application.port":U.getApplicationPort()};
    var targetAddress = config.get('workspaceAddress').replace(/{([a-zA-Z_0-9\.]+)}/g, function(match, key) { 
      return typeof replacements[key] != 'undefined'
        ? replacements[key]
        : match
      ;
    });
    response.writeHead(302, {'Location': targetAddress});
    response.end();
}
function workspaceProxyFunction(proxy){
    var identifierRegex = /^([$A-Z_][0-9A-Z_$]{3,9})\./i;
    return function(req, res, next) {
        var match = identifierRegex.exec(req.headers.host);
        if (match){
            req.pause();
            db.workspaces.getById(match[1]).done(function (workspace){
                req.resume();
                var tar = 'http://192.168.100.128:'+workspace.port;
                proxy.web(req, res, {
                    target: tar
                });
            },function(err){
                req.resume();
                res.writeHead(500, {"Content-Type":"text/plain"});
                res.write(err.message);
                res.end();
                console.log(err.stack);
            });
        }else{
            next();
        }
    };
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