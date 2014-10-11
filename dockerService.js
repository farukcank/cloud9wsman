var http = require("http");
var Q = require("q");
var config = require('config');

function requestOptions(obj){
    var docker = config.get('docker');
    obj.socketPath = docker.socketPath;
    obj.port = docker.port;
    obj.host = docker.host;
    obj.hostName = docker.hostName;
    return obj;
}
function bodyAsJson(result){
    return JSON.parse(result.body[0]);
}
function doRequest(method, path, headers, data){
    var deferred = Q.defer();
    var req = http.request(requestOptions({'method':method,'path':path,'headers':headers}), function(res) {
        res.setEncoding('utf8');
        var body = null;
        res.on('data', function (chunk) {
            if (body===null)
                body = [chunk];
            else
                body.push(chunk);
        });
        res.on('end', function () {
            var result = {'status':res.statusCode,'headers':res.headers,'body':body};
            if (res.statusCode>=400){
                var error = new Error("Response code: " + res.statusCode + " for : "+path);
                error.result = result;
                deferred.reject(error);
            } else {
                deferred.resolve(result);
            }
        });
    });
    req.on('error', function(e) {
        deferred.reject(new Error("problem with request: " + e.message));
    });
    if (data)
        req.write(data); 
    req.end();
    return deferred.promise;
}
function doGet(path){
    return doRequest('GET',path);
}

function doPostJson(path, data){
    return doRequest('POST',path,{'Content-Type':'application/json'},JSON.stringify(data));
}

function doPost(path){
    return doRequest('POST',path);
}

function doDelete(path){
    return doRequest('DELETE',path);
}

function getRunningContainers(){
    return doGet('/containers/json').then(bodyAsJson);
}

function getAllContainers(){
    return doGet('/containers/json?all=1').then(bodyAsJson);
}

function startContainer(id, ports){
    var portBindings = {};
    var portCount = ports.length;
    for (var i = 0; i < portCount; i++) {
        portBindings[ports[i]+'/tcp']=[{"HostIp": "0.0.0.0", "HostPort": ports[i] }];
    }
    var data = {
         "Binds":["/tmp:/tmp"],
         "PortBindings":portBindings,
         "PublishAllPorts":false,
         "Privileged":false,
         "Dns": ["8.8.8.8"]
    };
    return doPostJson('/containers/'+id+'/start', data);
}

function createContainer(image, command, ports){
    var exportedPorts = {};
    var portCount = ports.length;
    for (var i = 0; i < portCount; i++) {
        exportedPorts[ports[i]+'/tcp']={};
    }
    var data = {
        "AttachStderr": false,
        "AttachStdin": false,
        "AttachStdout": false,
        "Cmd": ["/cloud9.sh", ports[0]],
        "CpuShares": 0,
        "Cpuset": "",
        "Domainname": "",
        "Entrypoint": null,
        "Env": ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
        "ExposedPorts": exportedPorts,
        "Hostname": "",
        "Image": image,
        "Memory": 0,
        "MemorySwap": 0,
        "NetworkDisabled": false,
        "OnBuild": null,
        "OpenStdin": false,
        "PortSpecs": null,
        "StdinOnce": false,
        "Tty": false,
        "User": "",
        "Volumes": {
            "/tmp": {}
        },
        "WorkingDir": ""
    };
    return doPostJson('/containers/create', data).then(bodyAsJson).then(function(result){return result.Id;});
}

function stopContainer(id){
    return doPost('/containers/'+id+'/stop');
}

function killContainer(id){
    return doPost('/containers/'+id+'/kill');
}

function restartContainer(id){
    return doPost('/containers/'+id+'/restart');
}

function pauseContainer(id){
    return doPost('/containers/'+id+'/pause');
}

function unpauseContainer(id){
    return doPost('/containers/'+id+'/unpause');
}

function removeContainer(id){
    return doDelete('/containers/'+id+'?v=1&force=1');
}

function getProcessesOfContainer(id){
    return doGet('/containers/'+id+'/top').then(bodyAsJson);
}
function getLogsOfContainer(id){
    return doGet('/containers/'+id+'/logs?stderr=1&stdout=1&timestamps=1&follow=0&tail=all').then(function(result){
        return JSON.stringify(result.body);
    });
}
function inspectContainer(id){
    return doGet('/containers/'+id+'/json').then(bodyAsJson);
}
function callFunction(f){
    return function(){
        var _args = arguments;
        return function(){
            return f.apply(undefined, _args);
        };
    };
}

exports.container = {
    'list':getRunningContainers,
    'listAll':getAllContainers,
    'start':startContainer,
    'create':createContainer,
    'stop':stopContainer,
    'kill':killContainer,
    'restart':restartContainer,
    'pause':pauseContainer,
    'unpause':unpauseContainer,
    'getProcesses':getProcessesOfContainer,
    'getLogs':getLogsOfContainer,
    'inspect':inspectContainer,
    'remove':removeContainer
    };
/*
inspectContainer('2147d566f9e26ff627cb654cf7d0299faaa87baf75efbd75e8c561878fd2c43b')
    .then(console.log);

createContainer("cank/cloud9:v1", ["/cloud9.sh", "8765"], ["8765"]).then(function(containerId){
    console.log('Working with container '+containerId);
    return startContainer(containerId,["8765"])
        .delay(10000)
        .then(callFunction(stopContainer)(containerId))
        .delay(3000)
        .then(callFunction(removeContainer)(containerId));
}).done();
*/
/*
createContainer().then(function(result){
    var containerId = result.Id;
    console.log('Working with container '+containerId);
    return startContainer(containerId).delay(1000).then(callFunction(stopContainer)(containerId));
}).done();
inspectContainer('2147d566f9e26ff627cb654cf7d0299faaa87baf75efbd75e8c561878fd2c43b')
    .then(console.log)
    .then(callFunction(inspectContainer)('39b8e6c93f104002f7167a52d8b60337d699bc9e41b05238981871f222c8a021'))
    .then(console.log)
    .then(callFunction(startContainer)('2147d566f9e26ff627cb654cf7d0299faaa87baf75efbd75e8c561878fd2c43b'))
    .then(getRunningContainers)
    .then(console.log)
    .delay(2000)
    .then(callFunction(getProcessesOfContainer)('2147d566f9e26ff627cb654cf7d0299faaa87baf75efbd75e8c561878fd2c43b'))
    .then(console.log)
    .then(callFunction(stopContainer)('2147d566f9e26ff627cb654cf7d0299faaa87baf75efbd75e8c561878fd2c43b'))
    .delay(1000)
    .then(getRunningContainers)
    .then(console.log).done();
    */