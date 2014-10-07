var router = require("./router");
var server = require("./server");
var session = require("./session");
var dockerService = require("./dockerService");
var Q = require("q");
var db = require("./db");
var crypto = require('crypto');

//db.createUser({"username":"test","name":"john doe"},function(success){if (success)console.log("User created");else console.log("Failed to create user");});
//db.doStuff();
function sendJSON(response, code, header, data){
    header['Content-Type']='application/json';
    response.writeHead(code, header);
    response.write(JSON.stringify(data));
    response.end();
}
function jsonErrorHandler(response){
    return function(error){
        console.error("ERROR: "+error);
        if (error && error.code == 'invalidUsernameOrPassword'){
            sendJSON(response, 401, {}, {"message":"invalidusernameorpassword"});
        }else if (error && error.code == 'forbiden'){
            sendJSON(response, 403, {}, {"message":"forbiden"});
        }else if (error && error.code == 'noUserInSession'){
            sendJSON(response, 401, {}, {"message":"unauthorized"});
        }else{
            sendJSON(response, 500, {}, {"message":"internalservererror"});
        }
    };
}

function jsonResultHandler(response, session){
    return function(result){
        var header;
        if (session)
            header = session.addToHeader({});
        else
            header = {};
        sendJSON(response, 200, header, result);
    };
}

function jsonEmptyResultHandler(response, session){
    return function(result){
        var header = {};
        if (session)
            header = session.addToHeader({"Content-Type": "application/json"});
        response.writeHead(204, header);
        response.end();
    };
}

function listUserHandler(request, response){
    db.users.list().done(jsonResultHandler(response), jsonErrorHandler(response));
}
function parseJSONBody(request){
    var deferred = Q.defer();
    var body='';
    request.on('data', function (data) {
        body = body + data;
    });
    request.on('end', function () {
        var obj = JSON.parse(body);
        deferred.resolve(obj);
    });
    return deferred.promise;
}
function createUserHandler(request, response){
    parseJSONBody(request).then(function(user){
        user.password = crypto.createHmac('sha512', user.username).update(user.password).digest('base64');
        return db.users.create(user);
    }).done(jsonEmptyResultHandler(response), jsonErrorHandler(response));
}
function updateUserHandler(request, response){
    parseJSONBody(request).then(function(user){
        return db.users.update(user);
    }).done(jsonEmptyResultHandler(response), jsonErrorHandler(response));
}
function deleteUserHandler(request, response){
    parseJSONBody(request).then(function(user){
        return db.users.delete(user);
    }).done(jsonEmptyResultHandler(response), jsonErrorHandler(response));
}
function setUserPasswordHandler(request, response){
    parseJSONBody(request).then(function(user){
        user.password = crypto.createHmac('sha512', user.username).update(user.password).digest('base64');
        return db.users.setPassword(user);
    }).done(jsonEmptyResultHandler(response), jsonErrorHandler(response));
}
function setUserToSession(session){
    return function(user){
        var obj = session.object;
        if (!obj){
            obj = {};
        }
        obj.user = user;
        session.updateSessionObject(obj);
        return user;
    };
}
function clearUserFromSession(session){
    return function(){
        var obj = session.object;
        if (!obj){
            obj = {};
        }
        obj.user = null;
        session.updateSessionObject(obj);
        return null;
    };
}
function loginUserHandler(request, response){
    Q.all([parseJSONBody(request), session.getSession(request)]).spread(function(credentials, session) {
        credentials.password = crypto.createHmac('sha512', credentials.username).update(credentials.password).digest('base64');
        return db.users.login(credentials).then(setUserToSession(session)).then(jsonEmptyResultHandler(response, session));
    }).catch(jsonErrorHandler(response));
}

function getUser(session){
    var obj = session.object;
    var user = obj?obj.user:null;
    if (user){
        return Q(user);
    }else{
        var error = new Error('no user in session');
        error.code='noUserInSession';
        return Q.reject(error);
    }
}

function logoutUserHandler(request, response){
    Q.all([parseJSONBody(request), session.getSession(request)]).spread(function(req, session) {
        return getUser(session).then(function(user){
            return db.users.logout(user);
        }).then(clearUserFromSession(session)).then(jsonEmptyResultHandler(response, session));
    }).catch(jsonErrorHandler(response));
}

function currentUserHandler(request, response){
    session.getSession(request).then(function(session) {
        return getUser(session).then(jsonResultHandler(response));
    }).catch(function(error){
        if (error && error.code == 'noUserInSession'){
            sendJSON(response, 200, {}, null);
            return Q(null);
        }else{
            Q.reject(error);
        }
    }).catch(jsonErrorHandler(response));
}
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
    db.workspaces.list().then(putWorkspaceStates).done(jsonResultHandler(response), jsonErrorHandler(response));
}

function listMyWorkspacesHandler(request, response){
    session.getSession(request).then(getUser).then(function(user){
        return db.workspaces.listByUsername(user.username);
    }).then(putWorkspaceStates).done(jsonResultHandler(response), jsonErrorHandler(response));
}

function createMyWorkspaceHandler(request, response){
    Q.all([parseJSONBody(request), session.getSession(request).then(getUser)]).spread(function(workspace, user) {
        return db.workspaces.findAvailablePort(11000,15000).then(function(p){
            var port = p.toString();
            return dockerService.container.create("cank/cloud9:v1", ["/cloud9.sh", port], [port]).then(function(containerId){
                workspace.identifier = containerId;
                workspace.username = user.username;
                workspace.port = port;
                return db.workspaces.create(workspace);
            }).then(putWorkspaceState);
        });
    }).done(jsonResultHandler(response), jsonErrorHandler(response));
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
    Q.all([parseJSONBody(request), session.getSession(request).then(getUser)]).spread(function(workspace, user) {
        return db.workspaces.getById(workspace.id).then(checkWorkspaceUser(user)).then(function(ws){
            return callback(ws).then(function(){
                return dockerService.container.inspect(ws.identifier).get('State');
            });
        });
    }).done(jsonResultHandler(response), jsonErrorHandler(response));
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
    Q.all([parseJSONBody(request), session.getSession(request).then(getUser)]).spread(function(workspace, user) {
        return db.workspaces.getById(workspace.id).then(checkWorkspaceUser(user)).then(function(ws){
            return dockerService.container.remove(ws.identifier).then(function(){
                return db.workspaces.delete(ws);
            });
        });
    }).done(jsonEmptyResultHandler(response), jsonErrorHandler(response));
}
function updateMyWorkspaceHandler(request, response){
    Q.all([parseJSONBody(request), session.getSession(request).then(getUser)]).spread(function(workspace, user) {
        return db.workspaces.getById(workspace.id).then(checkWorkspaceUser(user)).then(function(ws){
            ws.name = workspace.name;
            ws.description = workspace.description;
            return db.workspaces.update(ws).then(putWorkspaceState);
        });
    }).done(jsonResultHandler(response), jsonErrorHandler(response));
}

router.register("/users/list",listUserHandler);
router.registerPost("/users/create",createUserHandler);
router.registerPost("/users/update",updateUserHandler);
router.registerPost("/users/setPassword",setUserPasswordHandler);
router.registerPost("/users/delete",deleteUserHandler);
router.registerPost("/login",loginUserHandler);
router.registerPost("/logout",logoutUserHandler);
router.register("/currentUser",currentUserHandler);
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

server.start(process.env.PORT, '0.0.0.0', router);