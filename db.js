var pg = require('pg');
var conString = "postgres://cloud9wsman:cloud9wsman@localhost/cloud9wsmandb";
var Q = require("q");
function logErrorMessage(message, detail){
    console.error(message, detail);
}
function queryDB(query, vals){
    var deferred = Q.defer();
    pg.connect(conString, function(err, client, done) {
        if(err) {
            console.error('error fetching client from pool', err);
            var error = new Error('error fetching client from pool: '+ err);
            error.code='connectionError';
            deferred.reject(error);
            return;
        }
        client.query(query, vals, function(err, result) {
            done();
            if(err) {
                var error = new Error('error running query: '+ err);
                error.code='queryError';
                deferred.reject(error);
                return;
            }
            deferred.resolve(result);
        });
    });
    return deferred.promise;
}
function toRows(result){
    return result.rows;
}
function first(result){
    if (result.length>1)
        return Q(result[0]);
    else{
        var error = new Error('record not found');
        error.code='recordNotFound';
        return Q.reject(error);
    }
}
function single(result){
    if (result.length==1)
        return Q(result[0]);
    else if (result.length===0){
        var error = new Error('record not found');
        error.code='recordNotFound';
        return Q.reject(error);
    }else{
        var error2 = new Error('multipe record found');
        error2.code='multipeRecordFound';
        return Q.reject(error2);
    }
}
function querySequence(sequenceName){
    return queryDB('SELECT nextval($1)',[sequenceName]).then(toRows).then(single).get('nextval');
}

function listUsers(){
    return queryDB('SELECT username, name, email, enabled, userroles from users', []).then(toRows);
}
function userLogout(user){
    return Q(true);
}
function userLogin(credentials){
    return queryDB('SELECT username, name, email, enabled, userroles from users where username=$1 and password=$2', [credentials.username, credentials.password]).then(function(result){
        if (result.rows.length>0){
            return Q(result.rows[0]);
        }else{
            var error = new Error('invalid username or password');
            error.code='invalidUsernameOrPassword';
            return Q.reject(error);
        }
    });
}

function createUser(user){
    return queryDB('insert into users(username, name, email, password, enabled, userroles) values ($1, $2, $3, $4, $5, $6)', [user.username, user.name, user.email, user.password, user.enabled, user.userroles]).then(function(){return user;});
}

function updateUser(user){
    return queryDB('update users set name=$2, email=$3, enabled=$4, userroles=$5 where username=$1', [user.username, user.name, user.email, user.enabled, user.userroles]).then(function(){return user;});
}

function setUserPassword(user){
    return queryDB('update users set password=$2 where username=$1', [user.username, user.password]).then(function(){return user;});
}

function deleteUser(user,callback){
    return queryDB('delete from users where username = $1', [user.username]).then(true);
}

function listWorkspacesOfUser(username){
    return queryDB('select id, name, identifier, username, port, description from workspace where username=$1',[username]).then(toRows);
}

function listWorkspaces(){
    return queryDB('select id, name, identifier, username, port, description from workspace').then(toRows);
}

function getWorkspaceById(id){
    return queryDB('select id, name, identifier, username, port, description from workspace where id=$1',[id]).then(toRows).then(single);
}

function createWorkspace(workspace){
    return querySequence('workspace_sequence').then(function(id){
        return queryDB('insert into workspace(id, name, identifier, username, port, description) values ($1, $2, $3, $4, $5, $6)', [id, workspace.name, workspace.identifier, workspace.username, workspace.port, workspace.description])
            .then(function(){
                workspace.id=id;
                return workspace;
            });
    });
}

function deleteWorkspace(workspace){
    return queryDB('delete from workspace where id = $1', [workspace.id]).then(true);
}

function updateWorkspace(workspace){
    return queryDB('update workspace set name=$2, username=$3, description=$4 where id=$1', [workspace.id, workspace.name, workspace.username, workspace.description]).then(function(){return workspace;});
}

function isPortAvailable(port){
    return queryDB('select id from workspace where port=$1',[port]).then(toRows).then(function(rows){
        if (rows.length===0)
            return true;
        else
            return false;
    });
}

function findAvailablePort(startPort, endPort){
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

exports.users = {
    'list':listUsers,
    'create':createUser,
    'update':updateUser,
    'delete':deleteUser,
    'setPassword':setUserPassword,
    'login':userLogin,
    'logout':userLogout
    };
exports.workspaces = {
    'list':listWorkspaces,
    'listByUsername':listWorkspacesOfUser,
    'create':createWorkspace,
    'update':updateWorkspace,
    'delete':deleteWorkspace,
    'getById':getWorkspaceById,
    'findAvailablePort':findAvailablePort,
    'isPortAvailable':isPortAvailable
};