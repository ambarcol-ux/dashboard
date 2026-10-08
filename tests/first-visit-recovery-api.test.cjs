const assert=require('node:assert/strict'),compile=require('./compile.cjs');
let calls=[],sent=[],result={data:[],error:null};
process.env.SUPABASE_SERVICE_ROLE_KEY='test-secret';process.env.RESEND_API_KEY='test-mail';process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid';
const api=compile('app/api/primeras-citas/recuperar/route.ts',{'@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return result;}})},resend:{Resend:class{emails={send:async(...args)=>{sent.push(args);return {error:null};}}}}});
const req=(body={nombre:'María Test',email:'test@example.invalid'},headers={})=>new Request('https://erp.test/api/primeras-citas/recuperar',{method:'POST',headers,body:JSON.stringify(body)});
(async()=>{
 assert.equal((await api.POST(req(undefined,{origin:'https://evil.test'}))).status,403);
 assert.equal((await api.POST(req({nombre:'x',email:'wrong'}))).status,400);
 assert.equal((await api.POST(req({nombre:'x'.repeat(2100)}))).status,413);assert.equal(calls.length,0);
 let r=await api.POST(req());const generic=await r.json();assert.equal(r.status,200);assert.equal(sent.length,0);
 result={data:[{id:'12345678-1234-1234-1234-123456789000',email:'stored@example.invalid',fecha:'2026-10-20',revision:2}],error:null};
 r=await api.POST(req(undefined,{'x-vercel-forwarded-for':'192.0.2.1'}));assert.deepEqual(await r.json(),generic);assert.equal(sent.length,1);assert.equal(sent[0][0].to,'stored@example.invalid');assert.equal(calls[1].args.p_limite_ip.length,64);assert(!JSON.stringify(calls).includes('192.0.2.1'));
 const link=sent[0][0].text.match(/https:\/\/[^\s]+/)[0],url=new URL(link);assert.equal(url.searchParams.get('accion'),'reprogramar');
 const {verifyVisitLink}=compile('lib/first-visit-links.ts');const token=url.hash.slice(1);assert(verifyVisitLink(token,'test-secret'));const expires=Number(token.split('.')[1]);assert(expires>Date.now()+44*60000&&expires<=Date.now()+3600000);assert(!verifyVisitLink(token,'wrong-secret'));assert(!JSON.stringify(generic).includes(token));
 result={data:null,error:{message:'database secret'}};assert.equal((await api.POST(req())).status,503);
 delete process.env.RESEND_API_KEY;assert.equal((await api.POST(req())).status,503);
 console.log('PASS: recovery validates input, hides matches, emails stored owner only, hashes limits and issues short-lived private links');
})().catch(e=>{console.error(e);process.exitCode=1});
