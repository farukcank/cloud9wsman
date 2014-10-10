var Q = require("q");
var db = require("./db");
var crypto = require('crypto');

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
function getUser(session){
    var obj = session.object;
    var user = obj?obj.user:null;
    if (user){
        return Q(user);
    }else{
        return Q(null);
    }
}

function login(session, credentials){
    credentials.password = crypto.createHmac('sha512', credentials.username).update(credentials.password).digest('base64');
    return db.users.login(credentials).then(setUserToSession(session));
}

function encryptPassword(user){
    user.password = crypto.createHmac('sha512', user.username).update(user.password).digest('base64');
    return Q(user);
}

function logout(session){
    return getUser(session).then(db.users.logout).then(clearUserFromSession(session));
}
var roleMap = {"guest":["guest"],"user":["guest","user"],"admin":["guest","user","admin"]};
function requireUserF(f){
    return function(session){
        var obj = session.object;
        var user = obj?obj.user:null;
        if (user){
            if (!f(user)){
                var error = new Error('user is not authorized requested');
                error.code='forbiden';
                return Q.reject(error);    
            }
            return Q(user);
        }else{
            var error2 = new Error('no user in session');
            error2.code='noUserInSession';
            return Q.reject(error2);
        }
    };
}
function userHasRole(role){
    return function(user){
        return !role || roleMap[user.userroles].indexOf(role)>=0;
    };
}
function userHasUsername(username){
    return function(user){
        return user.username == username;
    };
}
function requireUser(role){
    return requireUserF(userHasRole(role));
}
function userHasAll(arr){
    return function(user){
        return arr.every(function(f){
            return f(user);
        });
    };
}
function userHasSome(arr){
    return function(user){
        return arr.some(function(f){
            return f(user);
        });
    };
}

// Setup
function setup(){
    // Create an admin user if there is not any user
    db.users.count().then(function(cnt){
        if (cnt===0){
            var defaultUser = {'username':'admin','email':'admin@admin.admin', 'name':'Administrator','password':'admin','enabled':true,'userroles':'admin'};
            return encryptPassword(defaultUser).then(db.users.create).then(function(user){
                console.log("There was no error in database created admin:admin");
            });
        }else{
            return Q(null);
        }
    }).done();
}

setup();

exports.getUser = getUser;
exports.login = login;
exports.encryptPassword = encryptPassword;
exports.logout = logout;
exports.requireUser = requireUser;
exports.requireUserF = requireUserF;
exports.userHasRole = userHasRole;
exports.userHasUsername = userHasUsername;
exports.userHasAll = userHasAll;
exports.userHasSome = userHasSome;