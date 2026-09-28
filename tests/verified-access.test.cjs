const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const mod={exports:{}};
new Function('exports','require',ts.transpileModule(fs.readFileSync('lib/verified-access.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(mod.exports,require);
let identity='a',role='asesora',active=true,authCalls=0,profileCalls=0;
const client={auth:{getSession:async()=>({data:{session:identity?{user:{id:identity,email:'local-untrusted'}}:null}}),getUser:async()=>{authCalls++;return{data:{user:identity?{id:identity,email:'verified'}:null},error:null}}},from(){return{select(){return this},eq(){return this},async single(){profileCalls++;return{data:{id:identity,rol:role,activo:active},error:null}}}}};
const initial=()=>({profile:{id:'a',rol:'admin',activo:true,authEmail:'server-verified'},verifiedAt:Date.now()});
(async()=>{
 let read=mod.exports.createAccessReader(client,initial());
 const [a,b]=await Promise.all([read(),read()]);
 assert.equal(a.profile.rol,'admin');assert.equal(a.user.email,'server-verified');assert.deepEqual(a,b);assert.equal(authCalls,0);assert.equal(profileCalls,0);
 assert.equal((await read()).profile.rol,'asesora');assert.equal(authCalls,1);assert.equal(profileCalls,1);
 identity='b';read=mod.exports.createAccessReader(client,initial());assert.equal((await read()).profile.id,'b');assert.equal(authCalls,2);
 identity='a';read=mod.exports.createAccessReader(client,{...initial(),verifiedAt:Date.now()-31000});assert.equal((await read()).profile.rol,'asesora');
 active=false;read=mod.exports.createAccessReader(client,{...initial(),profile:{...initial().profile,activo:false}});await assert.rejects(read,/perfil/);
 identity=null;read=mod.exports.createAccessReader(client,initial());await assert.rejects(read,/sesión/);
 console.log('PASS: verified bootstrap, shared initial request, fresh subsequent profile, expiry, identity change, inactive and logout');
})().catch(e=>{console.error(e);process.exitCode=1});
