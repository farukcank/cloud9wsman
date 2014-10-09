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
        var error = new Error('no user in session');
        error.code='noUserInSession';
        return Q.reject(error);
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

exports.getUser=getUser;
exports.login=login;
exports.encryptPassword=encryptPassword;
exports.logout=logout;