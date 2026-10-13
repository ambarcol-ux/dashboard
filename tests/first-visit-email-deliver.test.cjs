const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {deliverVisitEmails}=compile('lib/first-visit-email.ts');
const updates=[];
const db={from:t=>({update:v=>({eq:(c1,id)=>({eq:async(c2,st)=>{assert.equal(t,'primeras_citas_correos');assert.equal(st,'enviando');updates.push([id,v.estado,v.error]);return {error:null};}})})})};
(async()=>{
 const emails=[{id:'a',para:'a@x.co'},{id:'b',para:'b@x.co'},{id:'c',para:'c@x.co'}];
 const r=await deliverVisitEmails(db,emails,async e=>{if(e.id==='b')return {ok:false,error:'rechazado'};if(e.id==='c')throw Error('timeout');return {ok:true};});
 assert.equal(JSON.stringify(r),JSON.stringify({sent:1,failed:2}));
 assert.deepEqual(updates,[['a','enviado',null],['b','error','rechazado'],['c','error','El proveedor de correo no respondió.']]);
 console.log('PASS customer emails: each claimed email is marked sent or error, provider failures never stop the batch');
})().catch(e=>{console.error(e);process.exitCode=1});
