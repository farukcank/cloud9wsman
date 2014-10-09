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
function requireUser(role){
    return function(session){
        var obj = session.object;
        var user = obj?obj.user:null;
        if (user){
            if (role && roleMap[role].indexOf(user.role)<0){
                var error = new Error('user is not authorized requested: '+role+' got: '+user.role);
                error.code='unauthorized';
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

exports.getUser=getUser;
exports.login=login;
exports.encryptPassword=encryptPassword;
exports.logout=logout;
exports.requireUser = requireUser;