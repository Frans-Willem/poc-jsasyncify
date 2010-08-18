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

jsasyncify was a proof of concept to see if it was possible to automatically generate that kind of code, from simple code. For example, turn this:

	function blah() {
		var key1=db.get("key1");
		var key2=db.get("key2");
		return dosomethingWith(key1,key2);
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