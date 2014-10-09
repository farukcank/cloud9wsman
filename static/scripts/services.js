angular.module('cloud9wsmanApp.services', []).
factory('usersService', function($http) {
    var service = {};

    service.getUsers = function() {
        return $http.get('/users/list');
    };
    
    service.currentUser = function() {
        return $http.get('/currentUser',{'transformResponse':function(response) {
            return JSON.parse(response);
        }});
    };

    service.login = function(credentials){
        return $http({
            method: 'POST',
            url: '/login',
            data: credentials
        });
    };
    
    service.createUser = function(user){
        return $http({
            method: 'POST',
            url: '/users/create',
            data: user
        });
    };
    
    service.updateUser = function(user){
        return $http({
            method: 'POST',
            url: '/users/update',
            data: user
        });
    };
    
    service.resetPassword = function(credentials){
        return $http({
            method: 'POST',
            url: '/users/setPassword',
            data: credentials
        });
    };
    
    service.deleteUser = function(user){
        return $http({
            method: 'POST',
            url: '/users/delete',
            data: user
        });
    };
    
    service.logout = function(){
        return $http({
            method: 'POST',
            url: '/logout',
            data: {}
        });
    };
    return service;
}).factory('workspacesService', function($http) {
    var service = {};
    service.getWorkspaces = function() {
        return $http.get('/workspaces/list');
    };
    
    service.getMyWorkspaces = function() {
        return $http.get('/workspaces/listmy');
    };
    function registerWSPostAction(name, path){
        service[name]=function(workspace){
            return $http({
                method: 'POST',
                url: path,
                data: workspace
            });
        }
    }
    registerWSPostAction('createWorkspace','/workspaces/create');
    registerWSPostAction('updateWorkspace','/workspaces/update');
    registerWSPostAction('deleteWorkspace','/workspaces/delete');
    registerWSPostAction('startWorkspace','/workspaces/start');
    registerWSPostAction('stopWorkspace','/workspaces/stop');
    registerWSPostAction('killWorkspace','/workspaces/kill');
    registerWSPostAction('restartWorkspace','/workspaces/restart');
    registerWSPostAction('pauseWorkspace','/workspaces/pause');
    registerWSPostAction('resumeWorkspace','/workspaces/resume');
    
    return service;
});