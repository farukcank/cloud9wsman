var Q = require("q");
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
function sendJSON(response, code, header, data){
    header['Content-Type']='application/json';
    response.writeHead(code, header);
    response.write(JSON.stringify(data));
    response.end();
}
function jsonErrorHandler(response){
    return function(error){
        console.error("ERROR: "+error);
        console.error("ERROR: "+error.stack);
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
exports.parseJSONBody = parseJSONBody;
exports.sendJSON = sendJSON;
exports.jsonResultHandler = jsonResultHandler;
exports.jsonErrorHandler=jsonErrorHandler;
exports.jsonEmptyResultHandler=jsonEmptyResultHandler;