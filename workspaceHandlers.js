var U = require('./handlerUtility');
var dockerService = require("./dockerService");
var Q = require("q");
var db = require("./db");
var session = require("./session");
var auth = require("./auth");

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
function listWorkspacesHandler(request, response){
    db.workspaces.list().then(putWorkspaceStates).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}

function listMyWorkspacesHandler(request, response){
    session.getSession(request).then(auth.requireUser()).then(function(user){
        return db.workspaces.listByUsername(user.username);
    }).then(putWorkspaceStates).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}

function createMyWorkspaceHandler(request, response){
    Q.all([U.parseJSONBody(request), session.getSession(request).then(auth.requireUser())]).spread(function(workspace, user) {
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
function checkWorkspaceUser(user){
    return function(workspace){
        if (workspace.username!=user.username){
            var error = new Error('workspace user does not match');
            error.code='forbiden';
            return Q.reject(error);
        }else{
            return Q(workspace);
        }
    };
}
function myWorkspaceStateChangingHandler(request, response, callback){
    Q.all([U.parseJSONBody(request), session.getSession(request).then(auth.requireUser())]).spread(function(workspace, user) {
        return db.workspaces.getById(workspace.id).then(checkWorkspaceUser(user)).then(function(ws){
            return callback(ws).then(function(){
                return dockerService.container.inspect(ws.identifier).get('State');
            });
        });
    }).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}
function startMyWorkspaceHandler(request, response){
    myWorkspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.start(ws.identifier,[ws.port.toString()]);
    });
}
function stopMyWorkspaceHandler(request, response){
    myWorkspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.stop(ws.identifier,[ws.port.toString()]);
    });
}
function killMyWorkspaceHandler(request, response){
    myWorkspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.kill(ws.identifier,[ws.port.toString()]);
    });
}
function restartMyWorkspaceHandler(request, response){
    myWorkspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.restart(ws.identifier,[ws.port.toString()]);
    });
}
function pauseMyWorkspaceHandler(request, response){
    myWorkspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.pause(ws.identifier,[ws.port.toString()]);
    });
}
function resumeMyWorkspaceHandler(request, response){
    myWorkspaceStateChangingHandler(request, response, function(ws){
        return dockerService.container.unpause(ws.identifier,[ws.port.toString()]);
    });
}
function deleteMyWorkspaceHandler(request, response){
    Q.all([U.parseJSONBody(request), session.getSession(request).then(auth.requireUser())]).spread(function(workspace, user) {
        return db.workspaces.getById(workspace.id).then(checkWorkspaceUser(user)).then(function(ws){
            return dockerService.container.remove(ws.identifier).then(function(){
                return db.workspaces.delete(ws);
            });
        });
    }).done(U.jsonEmptyResultHandler(response), U.jsonErrorHandler(response));
}
function updateMyWorkspaceHandler(request, response){
    Q.all([U.parseJSONBody(request), session.getSession(request).then(auth.requireUser())]).spread(function(workspace, user) {
        return db.workspaces.getById(workspace.id).then(checkWorkspaceUser(user)).then(function(ws){
            ws.name = workspace.name;
            ws.description = workspace.description;
            return db.workspaces.update(ws).then(putWorkspaceState);
        });
    }).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}

exports.register = function(router){
    router.register("/workspaces/list",listWorkspacesHandler);
    router.register("/workspaces/my/list",listMyWorkspacesHandler);
    router.registerPost("/workspaces/my/create",createMyWorkspaceHandler);
    router.registerPost("/workspaces/my/delete",deleteMyWorkspaceHandler);
    router.registerPost("/workspaces/my/update",updateMyWorkspaceHandler);
    router.registerPost("/workspaces/my/start",startMyWorkspaceHandler);
    router.registerPost("/workspaces/my/stop",stopMyWorkspaceHandler);
    router.registerPost("/workspaces/my/kill",killMyWorkspaceHandler);
    router.registerPost("/workspaces/my/restart",restartMyWorkspaceHandler);
    router.registerPost("/workspaces/my/pause",pauseMyWorkspaceHandler);
    router.registerPost("/workspaces/my/resume",resumeMyWorkspaceHandler);
};