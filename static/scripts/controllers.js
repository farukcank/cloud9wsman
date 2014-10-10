var module = angular.module('cloud9wsmanApp.controllers', ['ngRoute']);
module.config(function($routeProvider) {
    $routeProvider
        .when('/', {
            templateUrl : 'pages/home.html',
            controller  : 'mainController'
        })
        .when('/about', {
            templateUrl : 'pages/about.html',
            controller  : 'aboutController'
        })
        .when('/manage', {
            templateUrl : 'pages/manage.html',
            controller  : 'manageController'
        })
        .when('/profile', {
            templateUrl : 'pages/profile.html',
            controller  : 'profileController'
        })
        .when('/users', {
            templateUrl : 'pages/users.html',
            controller  : 'usersController'
        })
        .when('/workspaces', {
            templateUrl : 'pages/workspaces.html',
            controller  : 'workspacesController'
        });
}); 
module.controller('usersController', function($scope, usersService) {
    $scope.usersList = [];
    usersService.getUsers().success(function (response) {
        $scope.usersList = response;
    }).error(function(response){
        console.error(response);
    });
    $scope.editUser = function(user){
        $scope.$broadcast('editUser',user);
    };
    $scope.clearQuery = function(){
        $scope.query = '';
    };
    $scope.resetUserPassword = function(user){
        $scope.$broadcast('resetPassword', user);
    };
    $scope.deleteUser = function(user){
        usersService.deleteUser(user).success(function(response){
            var idx = $scope.usersList.indexOf(user);
            if (idx != -1) {
                $scope.usersList.splice(idx, 1);
            }else{
                console.error("Could not remove the element");
            }
        }).error(function(response){
            console.error(response);
        });
    };
});

module.controller('editUserController', function($scope, usersService) {
    $scope.$on('editUser', function(on, user) {
        $scope.originalUser = user;
        $scope.user = {
            username: user.username,
            name: user.name,
            email: user.email,
            password:user.password,
            userroles:user.userroles,
            enabled:user.enabled
        };
        $scope.createMode=user.username?false:true;
        $('#editUserModal').modal('show');
    });
    $scope.updateUser = function(){
        $('#updateUserButton').button('loading');
        var f;
        if ($scope.createMode)
            f = usersService.createUser;
        else
            f = usersService.updateUser;
        f($scope.user).success(function(response){
            $('#updateUserButton').button('reset');
            $('#editUserModal').modal('hide');
            if ($scope.createMode){
                $scope.usersList.push($scope.user);
            }else{
                $scope.originalUser.username = $scope.user.username;
                $scope.originalUser.name = $scope.user.name;
                $scope.originalUser.email = $scope.user.email;
                $scope.originalUser.password = undefined;
                $scope.originalUser.userroles = $scope.user.userroles;
                $scope.originalUser.enabled = $scope.user.enabled;
            }
        }).error(function(response){
            $('#updateUserButton').button('reset');
            console.error(response);
        });
    };
});
module.controller('resetPasswordController', function($scope, usersService) {
    $scope.$on('resetPassword', function(on,user) {
        $scope.credentials = {username:user.username};
        $('#resetPasswordModal').modal('show');
    });
    $scope.resetPassword = function(){
        $('#resetPasswordButton').button('loading');
        usersService.resetPassword($scope.credentials).success(function(response){
            $('#resetPasswordButton').button('reset');
            $('#resetPasswordModal').modal('hide');
        }).error(function(response){
            $('#resetPasswordButton').button('reset');
            console.error(response);
        });
    };
});
module.controller('loginController', function($rootScope, $scope,usersService) {
    $scope.login = function(){
        $rootScope.$broadcast('currentUserAboutToChange');
        var credentials = {'username':$scope.username,'password':$scope.password};
        usersService.login(credentials).success(function(response) {
            $rootScope.$broadcast('currentUserChanged');
        }).error(function(response){
            console.error(response);
        });
    };
    $scope.logout = function(){
        $rootScope.$broadcast('currentUserAboutToChange');
        usersService.logout().success(function(response) {
            $rootScope.$broadcast('currentUserChanged');
        }).error(function(response){
            console.error(response);
        });
    };
}); 
module.controller('mainController', function($scope, usersService) {
    $scope.currentUser=null;
    $scope.currentUserChecked=false;
    function updateStatus(){
        $scope.shallLogin = $scope.currentUserChecked && $scope.currentUser===null;
        $scope.shallLogout = $scope.currentUserChecked && $scope.currentUser!==null;
    }
    
    function resetStatus(){
        $scope.currentUser=null;
        $scope.currentUserChecked=false;
    }
    
    function updateFromServer(){
        usersService.currentUser().success(function(response){
            $scope.currentUser = response;
            $scope.currentUserChecked=true;
            updateStatus();
        });
    }
    $scope.$on('currentUserChanged', function() {
        updateFromServer();
    });
    $scope.$on('currentUserAboutToChange', function() {
        resetStatus();
    });
    updateFromServer();
}); 
module.controller('aboutController', function($scope) {
}); 
module.controller('manageController', function($scope, workspacesService) {
    $scope.workspacesList = [];
    workspacesService.getMyWorkspaces().success(function (response) {
        $scope.workspacesList = response;
    }).error(function(response){
        console.error(response);
    });
    $scope.updateWorkspace = function(user){
        alert("NOT YET!");
    };
    $scope.deleteWorkspace = function(workspace){
        workspacesService.deleteWorkspace(workspace).success(function(response){
            var idx = $scope.workspacesList.indexOf(workspace);
            if (idx != -1) {
                $scope.workspacesList.splice(idx, 1);
            }else{
                console.error("Could not remove the element");
            }
        }).error(function(response){
            console.error(response);
        });
    };
}); 
module.controller('profileController', function($scope) {
}); 
module.controller('workspacesController', function($scope, workspacesService) {
    $scope.workspacesList = [];
    workspacesService.getWorkspaces().success(function (response) {
        $scope.workspacesList = response;
    }).error(function(response){
        console.error(response);
    });
    $scope.updateWorkspace = function(user){
        alert("NOT YET!");
    };
    $scope.deleteWorkspace = function(workspace){
        workspacesService.deleteWorkspace(workspace).success(function(response){
            var idx = $scope.workspacesList.indexOf(workspace);
            if (idx != -1) {
                $scope.workspacesList.splice(idx, 1);
            }else{
                console.error("Could not remove the element");
            }
        }).error(function(response){
            console.error(response);
        });
    };
}); 
module.controller('myWorkspacesController', function($scope, $rootScope, workspacesService) {
    $scope.workspacesList = [];
    workspacesService.getMyWorkspaces().success(function (response) {
        $scope.workspacesList = response;
    }).error(function(response){
        console.error(response);
    });
    $scope.editWorkspace = function(workspace){
        $scope.$broadcast('editMyWorkspace',workspace);
    };
    $scope.clearQuery = function(){
        $scope.query = '';
    };
    $scope.workspaceUrl = function(workspace){
        return '/workspaces/go?id='+workspace.id;
        //return "http://"+window.location.hostname+":"+workspace.port;
        //return "http://"+workspace.id+".cloud9wsman.com:"+window.location.port;
    };
    function registerWSStateAction(name,f){
        $scope[name]=function(workspace){
            f(workspace).success(function(state){
                workspace.state = state;
            }).error(function(response){
                console.error(response);
            });
        };
    }
    registerWSStateAction('startWorkspace',workspacesService.startWorkspace);
    registerWSStateAction('stopWorkspace',workspacesService.stopWorkspace);
    registerWSStateAction('killWorkspace',workspacesService.killWorkspace);
    registerWSStateAction('restartWorkspace',workspacesService.restartWorkspace);
    registerWSStateAction('pauseWorkspace',workspacesService.pauseWorkspace);
    registerWSStateAction('resumeWorkspace',workspacesService.resumeWorkspace);
    
    $scope.deleteWorkspace = function(workspace){
        workspacesService.deleteWorkspace(workspace).success(function(response){
            var idx = $scope.workspacesList.indexOf(workspace);
            if (idx != -1) {
                $scope.workspacesList.splice(idx, 1);
            }else{
                console.error("Could not remove the element");
            }
        }).error(function(response){
            console.error(response);
        });
    };
}); 
module.controller('editMyWorkspaceController', function($scope, workspacesService) {
    $scope.$on('editMyWorkspace', function(on, workspace) {
        $scope.originalWorkspace = workspace;
        $scope.workspace = {
            id: workspace.id,
            name: workspace.name,
            description: workspace.description,
            username:workspace.username
        };
        $scope.createMode=workspace.id?false:true;
        $('#editMyWorkspaceModal').modal('show');
    });
    $scope.updateWorkspace = function(){
        $('#editMyWorkspaceButton').button('loading');
        var f;
        if ($scope.createMode)
            f = workspacesService.createWorkspace;
        else
            f = workspacesService.updateWorkspace;
        f($scope.workspace).success(function(response){
            $('#editMyWorkspaceButton').button('reset');
            $('#editMyWorkspaceModal').modal('hide');
            if ($scope.createMode){
                $scope.workspacesList.push(response);
            }else{
                for(var key in response){
                    $scope.originalWorkspace[key] = response[key];
                }
            }
        }).error(function(response){
            $('#editMyWorkspaceButton').button('reset');
            console.error(response);
        });
    };
});
module.controller('headerController', function($rootScope,$scope,$location, usersService) {
    $scope.isActive = function (viewLocation) { 
        return viewLocation === $location.path();
    };
    $scope.login = function(){
        $rootScope.$broadcast('currentUserAboutToChange');
        var credentials = {'username':$scope.username,'password':$scope.password};
        usersService.login(credentials).success(function(response) {
            $rootScope.$broadcast('currentUserChanged');
        }).error(function(response){
            console.error(response);
        });
    };
    $scope.logout = function(){
        $rootScope.$broadcast('currentUserAboutToChange');
        usersService.logout().success(function(response) {
            $rootScope.$broadcast('currentUserChanged');
        }).error(function(response){
            console.error(response);
        });
    };
}); 
