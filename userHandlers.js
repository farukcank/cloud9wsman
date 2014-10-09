var U = require('./handlerUtility');
var Q = require("q");
var db = require("./db");
var auth = require('./auth');
var session = require("./session");

function listUserHandler(request, response){
    session.getSession(request).then(auth.requireUser('admin')).then(db.users.list).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
}

function createUserHandler(request, response){
    Q.all([U.parseJSONBody(request), session.getSession(request).then(auth.requireUser('admin'))]).spread(function(user, loggedInUser) {
        auth.encryptPassword(user).then(db.users.create);
    }).done(U.jsonEmptyResultHandler(response), U.jsonErrorHandler(response));
}
function updateUserHandler(request, response){
    Q.all([U.parseJSONBody(request), session.getSession(request)]).spread(function(user, session) {
        var hasAdminRole = auth.userHasRole('admin');
        var hasSameUsername = auth.userHasUsername(user.username);
        var requirement = auth.userHasSome([hasAdminRole,hasSameUsername]);
        return Q(session).then(auth.requireUserF(requirement)).then(function(loggedInUser){
            if (!hasAdminRole(loggedInUser)){
                if (loggedInUser.userroles != user.userroles || loggedInUser.enabled != user.enabled){
                    var error = new Error('user is not authorized requested');
                    error.code='forbiden';
                    return Q.reject(error);
                }
            }
            return Q(loggedInUser);
        }).then(db.users.update.bind(null,user));
    }).done(U.jsonEmptyResultHandler(response), U.jsonErrorHandler(response));
}
function deleteUserHandler(request, response){
    Q.all([U.parseJSONBody(request), session.getSession(request).then(auth.requireUser('admin'))]).spread(function(user, loggedInUser) {
        return db.users.delete(user);
    }).done(U.jsonEmptyResultHandler(response), U.jsonErrorHandler(response));
}
function setUserPasswordHandler(request, response){
    Q.all([U.parseJSONBody(request), session.getSession(request)]).spread(function(user, session) {
        var hasAdminRole = auth.userHasRole('admin');
        var hasSameUsername = auth.userHasUsername(user.username);
        var requirement = auth.userHasSome([hasAdminRole,hasSameUsername]);
        return Q(session).then(auth.requireUserF(requirement)).then(auth.encryptPassword.bind(null,user)).then(db.users.setPassword);
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
    session.getSession(request).then(auth.getUser).done(U.jsonResultHandler(response), U.jsonErrorHandler(response));
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