const assert=require('node:assert/strict'),compile=require('./compile.cjs');
Object.assign(process.env,{FIRST_VISIT_WORKER_SECRET:'w',FIRST_VISIT_MESSAGES_ENABLED:'true',META_WA_TOKEN:'t',META_WA_PHONE_NUMBER_ID:'1',META_GRAPH_VERSION:'v21.0',META_APP_SECRET:'a',META_WA_VERIFY_TOKEN:'v',FIRST_VISIT_PUBLIC_ORIGIN:'https://erp.test/',NEXT_PUBLIC_SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'k',RESEND_API_KEY:'r',FIRST_VISIT_EMAIL_FROM:'a@b.co',FIRST_VISIT_INTERNAL_RECIPIENTS:'{"s":["x@y.co"]}'});
let jobs=[],updates=[],fake=null;global.fetch=(...a)=>fake(...a);
const db={rpc:async name=>({data:name==='tomar_mensaje_primera_cita'?jobs.shift()??null:null,error:null}),from:()=>({update:v=>({eq:()=>({eq:async()=>{updates.push(v);return {error:null};}})})})};
const worker=compile('app/api/primeras-citas/procesar/route.ts',{'@supabase/supabase-js':{createClient:()=>db},'resend':{Resend:class{emails={send:async()=>({data:{id:'e'}})}}}});
const job=()=>({mensaje:{id:'m',tipo:'confirmacion'},cita:{id:'00000000-0000-0000-0000-000000000001',fecha:'2026-10-15',hora:'15:00:00',cliente_nombre:'Ana',telefono:'3001234567',sede_id:'s',modalidad:'presencial'},sede:'Pereira'});
const run=async replies=>{const sent=[];fake=async(url,init)=>{const body=JSON.parse(init.body);sent.push(body.template?.name);const [status,d]=replies.shift();return {ok:status===200,status,json:async()=>d};};jobs=[job()];updates=[];
 await worker.POST(new Request('https://erp.test',{method:'POST',headers:{authorization:'Bearer w'}}));return {sent,update:updates[0]};};
(async()=>{
 let r=await run([[200,{messages:[{id:'wamid.1'}]}]]);
 assert.equal(JSON.stringify(r.sent),'["ambar_cita_confirmada_sede"]');assert.equal(r.update.estado,'enviado');assert.equal(r.update.plantilla,'ambar_cita_confirmada_sede');
 r=await run([[404,{error:{code:132001}}],[200,{messages:[{id:'wamid.2'}]}]]);
 assert.equal(JSON.stringify(r.sent),'["ambar_cita_confirmada_sede","ambar_confirmacion_cita"]');assert.equal(r.update.estado,'enviado');assert.equal(r.update.provider_id,'wamid.2');assert.equal(r.update.error,null);assert.equal(r.update.plantilla,'ambar_confirmacion_cita');
 r=await run([[400,{error:{code:131026}}]]);
 assert.equal(r.sent.length,1);assert.equal(r.update.estado,'error');assert.equal(r.update.plantilla,undefined);
 console.log('PASS: worker sends the detailed confirmation and falls back to the short template until Meta approves it');
})().catch(e=>{console.error(e);process.exitCode=1});
