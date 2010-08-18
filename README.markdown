# NOTE
Currently, I'm not working on jsasyncify. It was just a proof-of-concept, and for now, I believe it'd be too much work to fully implement.
Nevertheless, I think it could certainly be possible to have a converter that would take (a subset of) Javascript and turn it into asynchronous Javascript.
If you would like to pursue something like this, feel free to use any of the code in here, or use any of my ideas. All I ask is that if some of these ideas inspired you, you put a little note in your readme somewhere about it :)
# What is jsasyncify?
JSAsyncify is a proof of concept project that takes a piece of normal Javascript, and converts it to asynchronous javascript for use in Node.js.
# What to use it for ?
Let's say you have some code to reference a few keys in Redis:

	var db=redis.createClient();
	db.get("key1",function(err,key1) {
		if (err) {
			//Error handling here
		} else {
			db.get("key2",function(err,key2) {
				if (err) {
					//More error handling here
				} else {
					//...
				}
			});
		}
	});

That looks horrible. Let's say you choose to write a new function to get all the keys for you:

	var db=redis.createClient();
	function getKeys(callback) {
		db.get("key1",function(err,key1) {
			if (err) {
				callback(err);
			} else {
				db.get("key2",function(err,key2) {
					if (err) {
						callback(err);
					} else {
						callback(undefined,key1,key2);
					}
				});
			}
		});
	}
	
	getKeys(function(err,key1,key2) {
		//...
	});

That already looks better, if you put the getKeys function somewhere hidden. But writing the getKeys function is still a pain in the behind.

jsasyncify was a proof of concept to see if it was possible to automatically generate that kind of code, from simple code. For example, turning this:

	function blah() {
		return dosomethingWith(db.get("key1"),db.get("key2"));
	}

Into something more like:

	function blah(callback) {
		db.get("key1",blah_step2(callback));
	}
	
	function blah_step2(callback) {
		return function(err,key1) {
			if (err) {
				callback(err);
			} else {
				db.get("key2",blah_step3(key1,callback));
			}
		};
	}
	
	function blah_step3(key1,callback) {
		return function(err,key2,callback) {
			if (err) {
				callback(err);
			} else {
				dosomethingWith(key1,key2,blah_step4(key1,key2,callback));
			}
		};
	}
	
	function blah_step4(key1,key2,callback) {
		return function(err,result) {
			if (err) {
				callback(err);
			} else {
				callback(undefined,result);
			}
		}
	}

# Current results
Currently jsasyncify is able to turn:

	function blah() {
		return dosomethingWith(db.get("key1"),db.get("key2"));
	}

into the highly verbose

	function blah($callback) {
		try {
			return db.get("key1", blah$0($callback));
		} catch ($err) {
			return $callback($err);
		}
	}

	function blah$0($callback) {
		return function($err, $temp0) {
			if ($err) {
				return $callback($err);
			} else {
				try {
					return db.get("key2", blah$1($callback, $temp0));
				} catch ($err) {
					return $callback($err);
				}
			}
		};
	}

	function blah$1($callback, $temp0) {
		return function($err, $temp1) {
			if ($err) {
				return $callback($err);
			} else {
				try {
					return dosomethingWith($temp0, $temp1, blah$2($callback, $temp0, $temp1));
				} catch ($err) {
					return $callback($err);
				}
			}
		};
	}

	function blah$2($callback, $temp0, $temp1) {
		return function($err, $temp2) {
			if ($err) {
				return $callback($err);
			} else {
				try {
					return $callback(undefined, $temp2);
				} catch ($err) {
					return $callback($err);
				}
			}
		};
	}

Which is pretty cool. However, it has no concept of variables yet, or scope, or loops, or anything of that kind.
# Pitfalls
## Scope and nested functions
Scope is a pretty nasty beast for JS. For example, nested functions are allowed to change scope variables.
An example of how this might go wrong:

	function doSomething(a,b,c,d) {
		function incr() {
			a++;
		}
		var x=b(c);
		incr(10);
		return d;
	}

Would, currently, be converted to something like: (error handling left out)

	function doSomething(a,b,c,d,$callback) {
		function incr(howMuch,$callback) {
			a+=howMuch;
			return $callback(undefined);
		}
		b(c,doSomething$0(a,b,c,d,$callback,incr));
	}
	
	function doSomething$0(a,b,c,d,$callback,incr) {
		return function($err,$temp0) {
			var x=$temp0;
			incr(10,doSomething$1(a,b,c,d,$callback,incr,$temp0,x));
		}
	}
	
	function doSomething$1(a,b,c,d,$callback,incr,$temp0,x) {
		return function($err,$temp1) {
			return $callback(undefined,d);
		}
	}

This would fail, as incr would still be referencing the a in doSomething, not the a being passed along.
Something I came up with to fix this, would be to put all variables in the scope into an object, like this:

	function doSomething(a,b,c,d,$callback) {
		var $scope0={ //Number indicates depth, e.g. nested function get $scope1, nested functions in nested functions $scope2
			a:a,
			b:b,
			c:c,
			d:d,
			incr:undefined,
			x:undefined
		};
		$scope0.incr=function(howMuch,$callback) {
			var $scope1={
				howMuch:howMuch
			};
			$scope0.a+=$scope1.howMuch;
			return $callback(undefined);
		}
		b(c,doSomething$0($scope0,$callback));
	}
	
	function doSomething$0($scope0,$callback) {
		return function($err,$temp0) {
			$scope0.$temp0=$temp0; //Hold on to these in case multiple return values are needed for further down the line
			$scope0.x=$scope0.$temp0;
			$scope0.incr(10,doSomething$1($scope0,$callback));
		}
	}
	
	function doSomething$1($scope0,$callback) {
		return function($err,$temp1) {
			$scope0.$temp1=$temp1;
			return $callback(undefined,$scope0.d);
		}
	}

This way, all variables are scoped along with the callbacks. By giving each level of nested functions their own scope object, we can keep those neatly seperated too.
The only drawback is that we need to extract all var statements and function statements, keep track of which variables each function has and in which scope they are, etc.
While difficult, this should be possible. Javascript minifiers are already doing this.
## Calling built-in functions
Seeing as all function calls are converted to asynchronous function calls, Math.min and Math.max will fail, horribly.
One could put helper functions like:

	function $sync(method,args) {
		var $callback=arguments[arguments.length-1];
		var args=Array.prototype.slice.call(arguments,1,arguments.length-2);
		var ret;
		try {
			ret=method.apply(undefined,args);
		}
		catch($err) {
			return $callback($err);
		}
		return $callback(undefined,ret);
	}
	function $osync(obj,method,args) {
		var $callback=arguments[arguments.length-1];
		var args=Array.prototype.slice.call(arguments,2,arguments.length-3);
		var ret;
		try {
			ret=method.apply(obj,args);
		}
		catch($err) {
			return $callback($err);
		}
		return $callback(undefined,ret);
	}

But it'd be a pain to convert each and every Math.min(1,2,3) to $osync(Math,Math.min,1,2,3);
Possibly add these helper functions automatically for call that start with Math.xxx and other built in types?
But then what about calling slice on an array ?

Another method might be to prefix or postfix all asynchronous functions with something, e.g. function something would turn into somethingCb. internal functions references could automatically be adjusted, and only for external function would you have to manually define Cb functions ?
Maybe we could add a character before or after each function call that would indicate to the parser that it is a synchronous function being called? e.g. write Math.min$ or arr.slice$, and the parser will adjust that accordingly?
## Loops, try-catch blocks
## Call-stack size