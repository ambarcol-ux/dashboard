const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const role={exports:{}},profileModule={exports:{}};
vm.runInNewContext(transpile('lib/role-access.ts'),{exports:role.exports});
vm.runInNewContext(transpile('lib/deposit-profile.ts'),{exports:profileModule.exports});
const panels={exports:{}};
vm.runInNewContext(transpile('lib/panel-access.ts'),{exports:panels.exports,require:n=>n==='./role-access'?role.exports:require(n)});
const HEADER=profileModule.exports.DEPOSIT_PROFILE_HEADER;
let currentRole='contabilidad',active=true,authError=null,profileError=null,calls=0;
const mod={exports:{}};
vm.runInNewContext(transpile('middleware.ts'),{exports:mod.exports,URL,Headers,atob,AbortSignal,fetch,console,process:{env:{}},require:name=>name==='next/server'?{NextResponse:{next:opts=>({status:200,headers:opts.request.headers}),redirect:url=>({status:307,location:url.pathname}),json:(_,opts)=>opts}}:name==='@/lib/role-access'?role.exports:name==='@/lib/deposit-profile'?profileModule.exports:name==='@/lib/panel-access'?panels.exports:{createClient:()=>({rpc:async()=>({data:null,error:null}),auth:{getUser:async()=>{calls++;return{data:{user:authError?null:{id:'accounting'}},error:authError}}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'accounting',rol:currentRole,activo:active,nombre:'María Ámbar',email:'test@example.invalid',sede_id:null},error:profileError})})})})})}});
const token='header.'+Buffer.from(JSON.stringify({sub:'accounting'})).toString('base64url')+'.signature';
const request=(path,method='GET',transport='cookie',value=token)=>({nextUrl:{pathname:path},url:'https://erp.test'+path,method,cookies:{get:()=>transport==='cookie'&&value?{value}:undefined},headers:new Headers({[HEADER]:encodeURIComponent(JSON.stringify({id:'attacker',rol:'admin'})),...(transport==='bearer'?{authorization:'Bearer '+value}:{})})});
(async()=>{
 for(const transport of ['cookie','bearer'])for(const path of ['/dashboard','/admin/users','/admin/inventory','/admin/reports','/perfil','/contratos/nuevo','/disponibilidad','/firma/id','/entrega/id','/api/send-email'])for(const method of ['GET','POST']){
  const response=await mod.exports.middleware(request(path,method,transport));
  assert.equal(response.status,method==='GET'?307:403,`${transport} ${method} ${path}`);
  if(method==='GET')assert.equal(response.location,role.exports.DEPOSITS_PATH);
 }
 for(currentRole of ['admin','asesora'])assert.equal((await mod.exports.middleware(request('/dashboard'))).status,200);
 currentRole='contabilidad';
 const allowed=await mod.exports.middleware(request(role.exports.DEPOSITS_PATH));
 assert.equal(allowed.status,200);
 const profile=profileModule.exports.parseDepositProfile(allowed.headers.get(HEADER));
 assert.equal(profile.id,'accounting');assert.equal(profile.rol,'contabilidad');assert.equal(profile.nombre,'María Ámbar');
 for(const path of ['/login','/public','/agendar-primera-cita','/api/primeras-citas']){
  const before=calls;const response=await mod.exports.middleware(request(path,'GET','cookie',null));
  assert.equal(response.status,200);assert.equal(response.headers.has(HEADER),false);assert.equal(calls,before);
 }
 for(const value of [null,'bad-token'])assert.equal((await mod.exports.middleware(request(role.exports.DEPOSITS_PATH,'GET','cookie',value))).status,307);
 active=false;assert.equal((await mod.exports.middleware(request(role.exports.DEPOSITS_PATH))).status,307);active=true;
 authError={status:401};assert.equal((await mod.exports.middleware(request(role.exports.DEPOSITS_PATH))).status,307);
 authError={status:0};assert.equal((await mod.exports.middleware(request(role.exports.DEPOSITS_PATH))).status,503);authError=null;
 profileError={message:'RLS denied'};assert.equal((await mod.exports.middleware(request(role.exports.DEPOSITS_PATH))).status,307);
 profileError=null; currentRole='admin';
 assert.equal((await mod.exports.middleware(request('/api/dashboard/contracts','GET','cookie',null))).status,401);
 const api=await mod.exports.middleware(request('/api/dashboard/contracts'));
 assert.equal(api.status,200);assert.equal(profileModule.exports.parseDepositProfile(api.headers.get(HEADER)).id,'accounting');
 assert.ok(Number(api.headers.get('x-ambar-profile-verified-at'))>0);
 console.log('PASS: access boundaries, inactive/invalid sessions, RLS failure, timeout, forged header removal and verified profile forwarding');
})().catch(e=>{console.error(e);process.exitCode=1});
