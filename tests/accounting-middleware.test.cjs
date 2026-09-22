const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const role={exports:{}};vm.runInNewContext(transpile('lib/role-access.ts'),{exports:role.exports});
let currentRole='contabilidad';
const mod={exports:{}};
vm.runInNewContext(transpile('middleware.ts'),{exports:mod.exports,URL,process:{env:{}},require:name=>name==='next/server'?{NextResponse:{next:()=>({status:200}),redirect:url=>({status:307,location:url.pathname}),json:(_,opts)=>opts}}:name==='@/lib/role-access'?role.exports:{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'accounting'}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{rol:currentRole,activo:true}})})})})})}});
(async()=>{
for(const transport of ['cookie','bearer'])for(const path of ['/dashboard','/admin/users','/admin/inventory','/admin/reports','/perfil','/contratos/nuevo','/disponibilidad','/firma/id','/entrega/id','/api/send-email'])for(const method of ['GET','POST']){
 const response=await mod.exports.middleware({nextUrl:{pathname:path},url:'https://erp.test'+path,method,cookies:{get:()=>transport==='cookie'?{value:'token'}:undefined},headers:{get:()=>transport==='bearer'?'Bearer token':null}});
 assert.equal(response.status,method==='GET'?307:403,`${transport} ${method} ${path}`);
 if(method==='GET')assert.equal(response.location,role.exports.DEPOSITS_PATH);
}
for(currentRole of ['admin','asesora'])assert.equal((await mod.exports.middleware({nextUrl:{pathname:'/dashboard'},url:'https://erp.test/dashboard',method:'GET',cookies:{get:()=>({value:'token'})},headers:{get:()=>null}})).status,200);
console.log('PASS: cookie/Bearer URL and API accounting boundaries; admin/advisor unchanged');
})().catch(e=>{console.error(e);process.exitCode=1});
