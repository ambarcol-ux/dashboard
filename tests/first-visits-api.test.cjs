const assert=require('node:assert/strict'),compile=require('./compile.cjs');
let calls=[],rpcResult={data:{reservada:true,id:'ok'},error:null};
process.env.SUPABASE_SERVICE_ROLE_KEY='test-secret';process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid';
const api=compile('app/api/primeras-citas/route.ts',{'@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return rpcResult;},from:()=>({select:()=>({eq:()=>({order:async()=>({data:[{id:'site',nombre:'Test'}],error:null})})})})})}});
const body={id:'12345678-1234-1234-1234-123456789000',sede:'12345678-1234-1234-1234-123456789001',fecha:'2026-10-20',hora:'09:00',modalidad:'presencial',nombre:'Test Client',telefono:'3001234567',email:'',consentimiento:true,tipoVestido:'Gala'};
const req=(data=body,headers={})=>new Request('https://erp.test/api/primeras-citas',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
(async()=>{
 assert.equal((await api.POST(req(body,{origin:'https://evil.test'}))).status,403);assert.equal(calls.length,0);
 assert.equal((await api.POST(req({...body,hora:'19:00'}))).status,400);assert.equal(calls.length,0);
 let r=await api.POST(req(body,{'x-vercel-forwarded-for':'192.0.2.1'}));assert.equal(r.status,200);assert.equal(calls[0].name,'reservar_primera_cita_completa');assert.equal(calls[0].args.p_limite.length,64);assert(!JSON.stringify(calls[0]).includes('192.0.2.1'));assert.equal((await r.json()).reservada,true);
 rpcResult={data:{reservada:false,error:'Ese horario ya no está disponible.'},error:null};r=await api.POST(req());assert.equal(r.status,409);
 rpcResult={data:null,error:{message:'internal secret error'}};r=await api.POST(req());assert.equal(r.status,400);assert(!(await r.text()).includes('secret'));
 delete process.env.SUPABASE_SERVICE_ROLE_KEY;r=await api.GET(new Request('https://erp.test/api/primeras-citas'));assert.equal(r.status,503);
 console.log('PASS: API validation, request origin, private server RPC, hashed rate key, conflicts and unavailable configuration');
})().catch(e=>{console.error(e);process.exitCode=1});
