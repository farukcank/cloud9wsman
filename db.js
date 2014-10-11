var crypto = require('crypto');
var redis = require("redis"),
    client = redis.createClient();

var identifierRegex = /^[$A-Z_][0-9A-Z_$]{3,9}$/i;
// if you'd like to select database 3, instead of 0 (default), call
// client.select(3, function() { /* ... */ });

client.on("error", function (err) {
    console.log("Error " + err);
});

var keyPrefix = "cloud9wsman.";
var usersKey = keyPrefix+"users";
var workspacesKey = keyPrefix+"workspaces";
var sessionSecretKey = keyPrefix + "secretKey";
var Q = require("q");

function getSessionSecret(){
    return redis_get(sessionSecretKey).then(function(val){
        if (val===null || val===undefined){
            return randomHex(64).then(function(randomValue){
                return redis_setnx(sessionSecretKey, randomValue).then(function(res){
                    if (res==1){
                        redis_expire(sessionSecretKey, 2*24*60*60);// Two days
                        console.log("Generated session secret");
                        return Q(randomValue);
                    }else{
                        return getSessionSecret();
                    }
                });
            });
        }else{
            return Q(val);
        }
    });
}

exports.getSessionSecret = getSessionSecret;

function redisCallback(deferred){
    return function(err, res){
        if (err){
            var error = new Error('redis error');
            error.code='rediserror';
            deferred.reject(error);
        }else{
            deferred.resolve(res);
        }
    };
}

function expect(expected, code, message){
    return function(actual){
        if (actual!=expected){
            if (!message)
                message = 'expected '+expected+' got '+actual;
            if (!code)
                code='unexpectedvalue';
            var error = new Error(message);
            error.code=code;
            return Q.reject(error);
        }
        return actual;
    };
}

function expectNotNull(code, message){
    return function(actual){
        if (actual===null || actual === undefined){
            if (!message)
                message = 'null was not expected';
            if (!code)
                code='unexpectedvalue';
            var error = new Error(message);
            error.code=code;
            return Q.reject(error);
        }
        return actual;
    };
}

function redis_get(key){
    var deferred = Q.defer();
    client.get(key, redisCallback(deferred));
    return deferred.promise;
}

function redis_setnx(key, value){
    var deferred = Q.defer();
    client.setnx(key, value, redisCallback(deferred));
    return deferred.promise;
}
function redis_expire(key, seconds){
    var deferred = Q.defer();
    client.expire(key, seconds, redisCallback(deferred));
    return deferred.promise;
}


function redis_hget(key, field){
    var deferred = Q.defer();
    client.hget(key, field, redisCallback(deferred));
    return deferred.promise;
}

function redis_hvals(key){
    var deferred = Q.defer();
    client.hvals(key, redisCallback(deferred));
    return deferred.promise;
}

function redis_hsetnx(key, field, value){
    var deferred = Q.defer();
    client.hsetnx(key, field, value, redisCallback(deferred));
    return deferred.promise;
}

function redis_hset(key, field, value){
    var deferred = Q.defer();
    client.hset(key, field, value, redisCallback(deferred));
    return deferred.promise;
}

function redis_hdel(key, field){
    var deferred = Q.defer();
    client.hdel(key, field, redisCallback(deferred));
    return deferred.promise;
}

function redis_hlen(key){
    var deferred = Q.defer();
    client.hlen(key, redisCallback(deferred));
    return deferred.promise;
}


function constant(cn){
    return function(){
        return cn;
    }
}
function copyObject(src, dst, filter){
    filter.forEach(function (f) {
        dst[f]=src[f];
    });
    return dst;
}
function ff(f){
    var _this = this;
    return function(){
        var args = arguments;
        return function(){
            return f.apply(_this, args);
        };
    };
}
function internalFilterUserReturnFields(user){
    return copyObject(user, {}, ['username','name','email','enabled','userroles']);
}
function internalFilterUserReturnFieldsForArray(arr){
    return arr.map(internalFilterUserReturnFields);
}
function createUser(user){
    user = copyObject(user, {}, ['username','name','email','enabled','userroles','password']);
    if (!user || !user.username){
        var error = new Error('username does not exist');
        error.code='usernamedoesnotexist';
        return Q.reject(error);
    }
    if (!identifierRegex.test(user.username)){
        var error2 = new Error('invalid username');
        error2.code='invalidusername';
        return Q.reject(error2);
    }
    return redis_hsetnx(usersKey, user.username, JSON.stringify(user)).then(expect(1,'useralreadyexist','User already exists')).then(function(){
        return copyObject(user, {}, ['username','name','email','enabled','userroles']);
    });
}
function deleteUser(user){
    return redis_hdel(usersKey, user.username).then(expect(1,'userdoesnotexist','User does not exist')).then(constant(true));
}
function internalListUsers(){
    return redis_hvals(usersKey).then(function(res){
        return res.map(JSON.parse);
    });
}
function listUsers(){
    return internalListUsers().then(internalFilterUserReturnFieldsForArray);
}
function internalGetUser(username){
    return redis_hget(usersKey, username).then(JSON.parse).then(expectNotNull('userdoesnotexist','User does not exist: '+username));
}
function getUserByUsername(username){
    return internalGetUser(username).then(internalFilterUserReturnFields);
}
function internalUpdateUser(user, fields){
    return internalGetUser(user.username).then(function(dbUser){
        return redis_hset(usersKey,user.username,JSON.stringify(copyObject(user,dbUser,fields))).then(constant(dbUser)).then(internalFilterUserReturnFields);
    });
}
function updateUser(user){
    return internalUpdateUser(user,['name','email','enabled','userroles']);
}
function setUserPassword(user){
    return internalUpdateUser(user,['password']);
}

function userLogout(user){
    return Q(true);
}
function userLogin(credentials){
    return internalGetUser(credentials.username).fail(function(error){
        if (error.code=='userdoesnotexist'){
            var newError = new Error('invalidusernameorpassword');
            newError.code='invalidUsernameOrPassword';
            return Q.reject(newError); 
        }else{
            return Q.reject(error);
        }
    }).then(function(user){
        if (user.password!=credentials.password){
            var error = new Error('invalidusernameorpassword');
            error.code='invalidUsernameOrPassword';
            return Q.reject(error); 
        }
        return user;
    }).then(internalFilterUserReturnFields);
}
function getNumberOfUsers(){
    return redis_hlen(usersKey).then(parseInt);
}

exports.users = {
    'getByUsername':getUserByUsername,
    'list':listUsers,
    'create':createUser,
    'update':updateUser,
    'delete':deleteUser,
    'setPassword':setUserPassword,
    'login':userLogin,
    'logout':userLogout,
    'count':getNumberOfUsers
    };
    

var workspaceSafeFields = ["id", "name", "identifier", "username", "port", "description"];
function randomBytes(len){
    var deferred = Q.defer();
    crypto.randomBytes(len, function(ex, buf) {
        if (ex) {
            var newError = new Error('can not generate random data');
            newError.code='cannotGenerateRandomData';
            return deferred.reject(newError); 
        }else{
            return deferred.resolve(new Buffer(buf));
        }
    });
    return deferred.promise;
}
function randomHex(len){
    return randomBytes(len).then(function(buf){
        return buf.toString('hex');
    });
}
function getWorkspace(id){
    return redis_hget(workspacesKey, id).then(JSON.parse).then(expectNotNull('workspacedoesnotexist','Workspace does not exist: '+id));
}
function updateWorkspace(workspace){
    return getWorkspace(workspace.id).then(function(dbWorkspace){
        return redis_hset(workspacesKey,workspace.id,JSON.stringify(copyObject(workspace,dbWorkspace,workspaceSafeFields))).then(constant(dbWorkspace));
    });
}
function createWorkspace(workspace){
    if (!workspace || !workspace.id){
        var error = new Error('id does not exist');
        error.code='iddoesnotexist';
        return Q.reject(error);
    }
    if (!identifierRegex.test(workspace.id)){
        var error2 = new Error('invalid workspace id');
        error2.code='invalidworkspaceid';
        return Q.reject(error2);
    }
    workspace = copyObject(workspace, {}, workspaceSafeFields);
    return redis_hsetnx(workspacesKey, workspace.id, JSON.stringify(workspace)).then(expect(1,'workspacealreadyexist','Workspace already exists')).then(constant(workspace));
}
function deleteWorkspace(workspace){
    return redis_hdel(workspacesKey, workspace.id).then(expect(1,'workspacedoesnotexist','Workspace does not exist')).then(constant(true));
}
function listWorkspaces(){
     return redis_hvals(workspacesKey).then(function(res){
        return res.map(JSON.parse);
    });
}
function listWorkspacesOfUser(username){
    return listWorkspaces().then(function(workspaces){
        return workspaces.filter(function(workspace){
            return workspace.username==username;
        });
    });
}
function isPortAvailable(port){
    // TODO Extremely inefficent
    return listWorkspaces().then(function(workspaces){
        return workspaces.every(function(workspace){
            return workspace.port != port;
        });
    });
}

function findAvailablePort(startPort, endPort){
    // TODO Extremely inefficent X 2
    return isPortAvailable(startPort).then(function(available){
        if (available)
            return Q(startPort);
        else if (startPort<endPort)
            return findAvailablePort(startPort+1, endPort);
        else{
            var error = new Error('no available port found: '+startPort);
            error.code='noPortsAvailable';
            return Q.reject(error);
        }
    });
}

exports.workspaces = {
    'list':listWorkspaces,
    'listByUsername':listWorkspacesOfUser,
    'create':createWorkspace,
    'update':updateWorkspace,
    'delete':deleteWorkspace,
    'getById':getWorkspace,
    'findAvailablePort':findAvailablePort,
    'isPortAvailable':isPortAvailable,
};