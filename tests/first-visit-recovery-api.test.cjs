const assert=require('node:assert/strict'),compile=require('./compile.cjs');
let calls=[],result={data:[],error:null};
process.env.SUPABASE_SERVICE_ROLE_KEY='test-secret';process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid';delete process.env.RESEND_API_KEY;
const api=compile('app/api/primeras-citas/recuperar/route.ts',{'@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return result;}})}});
const req=(body={documento:'99.088.866-55'},headers={})=>new Request('https://erp.test/api/primeras-citas/recuperar',{method:'POST',headers,body:JSON.stringify(body)});
(async()=>{
 assert.equal((await api.POST(req(undefined,{origin:'https://evil.test'}))).status,403);
 assert.equal((await api.POST(req({documento:'wrong'}))).status,400);
 assert.equal((await api.POST(req({documento:'x'.repeat(2100)}))).status,413);assert.equal(calls.length,0);
 let r=await api.POST(req());assert.equal(r.status,200);assert.equal((await r.json()).citas.length,0);
 result={data:[{id:'12345678-1234-1234-1234-123456789000',fecha:'2026-10-20',hora:'09:00',sede:'Bogotá',modalidad:'presencial',email:'should-not-leak',cliente_nombre:'private'}],error:null};
 r=await api.POST(req(undefined,{'x-vercel-forwarded-for':'192.0.2.1'}));const data=await r.json();assert.equal(data.citas.length,1);assert.equal(calls[1].args.p_documento,'9908886655');assert.equal(calls[1].args.p_limite_ip.length,64);assert(!JSON.stringify(calls).includes('192.0.2.1'));assert(!JSON.stringify(data).includes('private'));assert(!JSON.stringify(data).includes('should-not-leak'));
 const token=data.citas[0].enlace.split('#')[1];const {verifyRescheduleLink,verifyVisitLink}=compile('lib/first-visit-links.ts');assert(verifyRescheduleLink(token,'test-secret'));assert(!verifyVisitLink(token,'test-secret'));assert(!verifyRescheduleLink(token,'test-secret',Date.now()+16*60000));assert(!verifyRescheduleLink(token+'tamper','test-secret'));
 result={data:null,error:{message:'database secret'}};assert.equal((await api.POST(req())).status,503);
 console.log('PASS: document search without email, validation, private data projection, hashed rate limits, expiring reschedule-only token');
})().catch(e=>{console.error(e);process.exitCode=1});
