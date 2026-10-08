const fs=require('fs'),vm=require('vm'),ts=require('typescript'),path=require('path');
const cache={};
module.exports=function compile(file,dependencies={}) {
 if(cache[file] && !Object.keys(dependencies).length)return cache[file];
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod.exports,require:n=>dependencies[n] || (n.startsWith('.')?compile(path.join(path.dirname(file),n)+'.ts'):n.startsWith('@/')?compile(n.slice(2)+'.ts'):require(n)),Date,Intl,Response,Request,URL,Headers,AbortSignal,fetch,process,console});
 cache[file]=mod.exports;return mod.exports;
};
