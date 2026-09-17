const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const mod={exports:{}};
let session=async()=>({data:{session:{access_token:'qa-token'}}}),calls=[],reply;
const fetchMock=async(url,options)=>{calls.push({url,...options});return reply(url,options)};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/save-calendar-contract.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
 exports:mod.exports,require:()=>({supabase:{auth:{getSession:()=>session()}}}),setTimeout,clearTimeout,AbortController,fetch:fetchMock,
});
const {saveCalendarContract}=mod.exports;
const input={id:'qa-contract',changes:{prexv_componentes:['fotos'],prexv_fotografo:'QA'},original:{prexv_componentes:null,prexv_fotografo:null}};
(async()=>{
 reply=async()=>Response.json({contract:{id:input.id,...input.changes}});
 assert.equal((await saveCalendarContract(input)).contract.prexv_fotografo,'QA');
 assert.deepEqual(JSON.parse(calls[0].body),input);
 reply=async()=>Response.json({error:'Conflicto de fechas'},{status:409});
 await assert.rejects(saveCalendarContract(input),/Conflicto de fechas/);
 reply=async()=>new Response('Bad Gateway',{status:502});
 await assert.rejects(saveCalendarContract(input),/No se pudo completar/);
 reply=async()=>Response.json({contract:{id:'different'}});
 await assert.rejects(saveCalendarContract(input),/confirmación/);
 // A hung request aborts; the next user-initiated save can succeed.
 reply=()=>new Promise(()=>{});
 await assert.rejects(saveCalendarContract(input,10),/tardó demasiado/);
 assert.equal(calls.at(-1).signal.aborted,true);
 reply=async()=>Response.json({contract:{id:input.id}});
 assert.equal((await saveCalendarContract(input)).contract.id,input.id);
 // Session refresh can hang too. No delayed write may start after timeout.
 let release;session=()=>new Promise(r=>{release=r});const before=calls.length;
 await assert.rejects(saveCalendarContract(input,10),/tardó demasiado/);
 release({data:{session:{access_token:'late-token'}}});
 await new Promise(r=>setTimeout(r,5));assert.equal(calls.length,before);
 console.log('PASS: confirmed save, server errors, malformed response, network timeout, retry, session timeout without delayed writes');
})().catch(e=>{console.error(e);process.exitCode=1});
