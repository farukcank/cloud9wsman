var Q = require("q");
var db = require("./db");
var crypto = require('crypto');

var NodeCache = require( "node-cache" );
var pbkdf2Cache = new NodeCache( { stdTTL: 100, checkperiod: 120 } );


function randomBytes(len){
    var deferred = Q.defer();
    crypto.randomBytes(32, function(err, key){
        if (err){
            return deferred.reject(err);
        }
        return deferred.resolve(key);
    });
    return deferred.promise;
}

function pbkdf2(salt, password){
    var cacheKey = JSON.stringify({"salt":salt,"password":password});
    var cached = pbkdf2Cache.get(cacheKey);
    if (cached[cacheKey]){
        return Q(cached[cacheKey]);
    }
    var deferred = Q.defer();
    crypto.pbkdf2(password, salt, 1000, 32, function(err,result){
        if (err){
            return deferred.reject(err);
        }
        pbkdf2Cache.set(cacheKey,result,300);
        return deferred.resolve(result);
    });
    return deferred.promise;
}

function encryptPW(password){
    return randomBytes(32).then(function(salt){
        return pbkdf2(salt, password).then(function(verifier){
            return Q({"verifier":new Buffer(verifier).toString("base64"),"method":"pbkdf2","salt":new Buffer(salt).toString("base64")});
        });
    });
}

function verifyPW(passwordRecord, password){
    return pbkdf2(new Buffer(passwordRecord.salt,'base64').toString('binary'), password).then(function(verifier){
        var ver = new Buffer(verifier).toString("base64");
        if (ver==passwordRecord.verifier){
            return Q(true);
        }else{
            //console.log(ver + " != " + passwordRecord.verifier);
            //var error = new Error("invalid username or password");
            //error.code = "invalidUsernameOrPassword";
            //return Q.reject(error);
            return Q(false);
        }
    });
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
    return checkLogin(credentials).then(setUserToSession(session));
}

function encryptPassword(user){
    return encryptPW(user.password).then(function(pw){
        user.password = pw;
        return Q(user);
    });
}

function checkLogin(credentials){
    return db.users.login(credentials.username, credentials.password, verifyPW);
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
            var defaultUser = {'username':'admin','email':'admin@admin.admin', 'name':'Administrator','enabled':true,'userroles':'admin'};
            return encryptPW('admin').then(function(rec){
                defaultUser.password = rec;
                return Q(defaultUser).then(db.users.create).then(function(user){
                    console.log("There was no error in database created admin:admin");
                });
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
exports.checkLogin = checkLogin;