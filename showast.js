require.paths.unshift(__dirname+"/UglifyJS/lib");
var jsp=require("parse-js");
var pro=require("process");
var fs=require("fs");
var sys=require("sys");

fs.readFile(process.argv[2],function(err,data) {
	if (err) {
		sys.puts("Err:" +err);
	} else {
		var ast=jsp.parse(data.toString());
		sys.puts("AST:");
		sys.puts(sys.inspect(ast,false,100));
	}
});