# What is jsasyncify?
JSAsyncify is a proof of concept project that takes a piece of normal Javascript, and converts it to asynchronous javascript for use in Node.js.
# What to use it for ?
Let's say you have some code to reference a few keys in Redis:

	var db=redis.createClient();
	db.get("key1",function(err,key1) {
		if (err) {
			//Error handling here
		}
		db.get("key2",function(err,key2) {
			if (err) {
				//More error handling here
			}
			...
		}
	}