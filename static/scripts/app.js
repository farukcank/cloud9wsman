var app = angular.module('cloud9wsmanApp', [
  'cloud9wsmanApp.controllers',
  'cloud9wsmanApp.services'
]);
app.run(['$rootScope', function($root) {
	$root.$on('$routeChangeStart', function(e, curr, prev) { 
		if (curr.$$route) {
			// Show a loading message until promises are not resolved
			$root.loadingView = true;
		}
	});
	$root.$on('$routeChangeSuccess', function(e, curr, prev) { 
		// Hide loading message
		$root.loadingView = false;
	});
}]);
app.directive('ngConfirmClick', [
  function(){
    return {
      priority: -1,
      restrict: 'A',
      link: function(scope, element, attrs){
        element.bind('click', function(e){
          var message = attrs.ngConfirmClick;
          if(message && !confirm(message)){
            e.stopImmediatePropagation();
            e.preventDefault();
          }
        });
      }
    }
  }
]);
app.directive('pwCheck', [function () {
	return {
		require: 'ngModel',
		link: function (scope, elem, attrs, ctrl) {
			var firstPassword = '#' + attrs.pwCheck;
			elem.add(firstPassword).on('keyup', function () {
				scope.$apply(function () {
					var v = elem.val()===$(firstPassword).val();
					ctrl.$setValidity('pwmatch', v);
				});
			});
		}
	}
}]);