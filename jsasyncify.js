require.paths.unshift(__dirname+"/UglifyJS/lib");
var jsp=require("parse-js");
var pro=require("process");
var fs=require("fs");
var sys=require("sys");

function transformToplevel(item) {
	switch (item[0]) {
		case 'defun': return transformFunction(item);
		default: throw new Error("Unknown toplevel token type: "+item[0])
	}
}

function getLineScopeVars(line) {
	switch (line[0]) {
		case 'return': return [];
		case 'block': return getScopeVars(line[1]);
		case 'var': return line[1].map(function(v) { return v[0]; });
		case 'try': return getLineScopeVars(line[1]);
		case 'return': return [];
		default: throw new Error("HELP!");
	}
}

function getScopeVars(body) {
	return concat(body.map(getLineScopeVars));
}

/**
 * returns [
 *   statement,
 *   value name to store call result
 *   function to call
 *   arguments to call with
 * ]
 */
function statementExtractFunctionCall(statement,nameAllocator) {
	var handlers={
		'string':function(value) { return [['string',value]] },
		'name':function(value) { return [['name',value]] },
		'num':function(value) { return [['num',value]] },
		'dot':function(pre,post) {
			var extracted=handle(pre);
			extracted[0]=['dot',extracted[0],post];
			return extracted;
		},
		'call':function(func,args) {
			var newArgs=[];
			var extracted=undefined;
			var temp;
			temp=statementExtractFunctionCall(func,nameAllocator);
			func=temp[0];
			if (temp.length>1) {
				extracted=temp;
			}
			for (var i=0; i<args.length; i++) {
				if (extracted!==undefined) {
					newArgs[i]=args[i];
				} else {
					temp=statementExtractFunctionCall(args[i],nameAllocator);
					newArgs[i]=temp[0];
					if (temp.length>1) {
						extracted=temp;
					}
				}
			}
			if (extracted!==undefined) {
				extracted[0]=['call',func,newArgs];
				return extracted;
			} else if (func[0]!=='name' || func[1]!=='$callback') {
				var retVarName=nameAllocator();
				return [['name',retVarName],retVarName,func,args];
			} else {
				return [statement];
			}
		}
	};
	function handle(ast) {
		if (ast[0] in handlers) {
			return handlers[ast[0]].apply(this,ast.slice(1));
		} else {
			throw new Error("Unknown type: "+ast[0]);
		}
	}
	return handle(statement);
}

function createReturn(statement) {
	return ["return"].concat(Array.prototype.slice.call(arguments));
}
function createBlock(statements) {
	return ["block",statements];
}
function createTryCatch(cmdTry,varCatch,cmdCatch) {
	return ["try",cmdTry,[varCatch,cmdCatch]];
}

function createDefun(name,args,body) {
	return ["defun",name,args,body];
}

function createFunction(name,args,body) {
	return ["function",name,args,body];
}

function createName(name) {
	return ["name",name];
}

function createCall(func,args) {
	return ["call",func,args];
}

function createIfElse(expression,cmdTrue,cmdFalse) {
	return ["if",expression,cmdTrue,cmdFalse];
}

function transformFunction(item,scope) {
	var ret=[];
	var funcIndex=0;
	var name=item[1];
	var args=item[2];
	var body=item[3];
	var nextTemp=0;
	var curbody=[];
	args.push("$callback");
	
	function tempvalAllocator() {
		return "$temp"+(nextTemp++);
	}
	
	ret.push(createDefun(
		name,
		args,
		[createTryCatch(
			createBlock(curbody),
			"$err",
			createBlock([
				createReturn(
					createCall(
						createName("$callback"),
						[createName("$err")]
					)
				)
			])
		)]
	));
	while (body.length>0) {
		var cur=body.shift();
		switch (cur[0]) {
			case 'return':{
				if (cur.length<2) {
					curbody.push(['return',['call',['name','$callback'],[['name','undefined']]]]);
				} else {
					var extr=statementExtractFunctionCall(cur[1],tempvalAllocator);
					if (extr.length>1) {
						body.unshift(['return',extr[0]]);
						//sys.puts("Extracted: "+sys.inspect(cmd,false,100));
						//body.unshift(cmd);
						curbody.push([
							'return',
							[
								'call',
								extr[2],
								extr[3].concat([
									[
										'call',
										['name',name+"$"+funcIndex],
										args.map(function(a) { return ['name',a]; })
									]
								])
							]
						]);
						curbody=[];
						ret.push(createDefun(
							name+"$"+(funcIndex++),
							args,
							[
								createReturn(
									createFunction(
										null,
										['$err',extr[1]],
										[
											createIfElse(
												createName("$err"),
												createBlock([
													createReturn(
														createCall(
															createName("$callback"),
															[createName("$err")]
														)
													)
												]),
												createBlock([
													createTryCatch(
														createBlock(curbody),
														"$err",
														createBlock([
															createReturn(
																createCall(
																	createName("$callback"),
																	[createName("$err")]
																)
															)
														])
													)
												])
											)
										]
									)
								)
							]
						));
						args=args.concat([extr[1]]);
					} else {
						//Normal return
						curbody.push(createReturn(
							createCall(
								createName('$callback'),
								[
									createName('undefined'),
									extr[0]
								]
							)
						));
					}
				}
				break;
			}
		}
	}
	return ret;
}

function concat(a) {
	if (a.length===0) return [];
	return Array.prototype.concat.apply(a[0],a.slice(1));
}

fs.readFile("tests/test0.js",function(err,data) {
	if (err) {
		sys.puts("Err:" +err);
	} else {
		var ast=jsp.parse(data.toString());
		sys.puts(sys.inspect(ast,false,100));
		ast[1]=concat(ast[1].map(transformToplevel));
		sys.puts(sys.inspect(ast,false,100));
		var fixed=pro.gen_code(ast,true);
		sys.puts("Data:\r\n"+fixed);
	}
});