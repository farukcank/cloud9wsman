
var Q = require("q");
var crypto = require('crypto');
var key = 'abcdeg';

function digest(text){
    return crypto.createHmac('sha512', key).update(text).digest('base64');
}

function parseCookies (request) {
    var list = {},
        rc = request.headers.cookie;

    rc && rc.split(';').forEach(function( cookie ) {
        var parts = cookie.split('=');
        list[parts.shift().trim()] = unescape(parts.join('='));
    });

    return list;
}

function getCookies(request){
    var cookies = parseCookies(request);
    var newCookies = {};
    function addCookie(key, value){
        newCookies[key] = value;
    }
    function addToHeader(header){
        var result = [];
        for (var key in newCookies) {
            result.push(key+'='+escape(newCookies[key]));
        }
        header['Set-Cookie']=result;
        return header;
    }
    return {'cookies':cookies, 'addCookie':addCookie,'addToHeader':addToHeader};
}

function getSession(request){
    var c = getCookies(request);
    var session = c.cookies.session;
    var sessionVerifier = c.cookies.sessionVerifier;
    var sessionObject = null;
    if (session && sessionVerifier && sessionVerifier == digest(session)){
        sessionObject = JSON.parse(session);
    }
    function updateSessionObject(object){
        var newSession = JSON.stringify(object);
        var newSessionVerifier = digest(newSession);
        c.addCookie('session', newSession);
        c.addCookie('sessionVerifier', newSessionVerifier);
    }
    return Q({'object':sessionObject, 'updateSessionObject':updateSessionObject, 'addToHeader':c.addToHeader});
}

//exports.withCookies = withCookies;
exports.getSession = getSession;