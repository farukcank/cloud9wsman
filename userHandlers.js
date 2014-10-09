var U = require('./handlerUtility');
var Q = require("q");
var db = require("./db");
var auth = require('./auth');
var session = require("./session");

function listUserHandler(request, response){
    db.users.list().done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}

function createUserHandler(request, response){
    U.parseJSONBody(request).then(auth.encryptPassword).then(function(user){
        return db.users.create(user);
    }).done(U.jsonEmptyResultHandler(response), U.jsonErrorHandler(response));
}
function updateUserHandler(request, response){
    U.parseJSONBody(request).then(function(user){
        return db.users.update(user);
    }).done(U.jsonEmptyResultHandler(response), U.jsonErrorHandler(response));
}
function deleteUserHandler(request, response){
    U.parseJSONBody(request).then(function(user){
        return db.users.delete(user);
    }).done(U.jsonEmptyResultHandler(response), U.jsonErrorHandler(response));
}
function setUserPasswordHandler(request, response){
    U.parseJSONBody(request).then(auth.encryptPassword).then(function(user){
        return db.users.setPassword(user);
    }).done(U.jsonEmptyResultHandler(response), U.jsonErrorHandler(response));
}

function loginUserHandler(request, response){
    Q.all([U.parseJSONBody(request), session.getSession(request)]).spread(function(credentials, session) {
        return auth.login(session, credentials).then(U.jsonEmptyResultHandler(response, session));
    }).catch(U.jsonErrorHandler(response));
}

function logoutUserHandler(request, response){
    // TODO Do we realy need body here?
    Q.all([U.parseJSONBody(request), session.getSession(request)]).spread(function(req, session) {
        return auth.logout(session).then(U.jsonEmptyResultHandler(response, session));
    }).catch(U.jsonErrorHandler(response));
}

function currentUserHandler(request, response){
    session.getSession(request).then(function(session) {
        return auth.getUser(session).then(U.jsonResultHandler(response));
    }).catch(function(error){
        if (error && error.code == 'noUserInSession'){
            U.sendJSON(response, 200, {}, null);
            return Q(null);
        }else{
            return Q.reject(error);
        }
    }).catch(U.jsonErrorHandler(response));
}

exports.register = function(router){
    router.register("/users/list",listUserHandler);
    router.registerPost("/users/create",createUserHandler);
    router.registerPost("/users/update",updateUserHandler);
    router.registerPost("/users/setPassword",setUserPasswordHandler);
    router.registerPost("/users/delete",deleteUserHandler);
    router.registerPost("/login",loginUserHandler);
    router.registerPost("/logout",logoutUserHandler);
    router.register("/currentUser",currentUserHandler);
};