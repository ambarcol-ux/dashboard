const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const compile=require('./compile.cjs');
const cal=compile('lib/contract-calendar.ts'),edit=compile('lib/calendar-edit.ts',{'./contract-calendar':cal});
assert.equal(edit.validateCalendarPatch({fecha_maquillaje:'2026-09-13T10:30'}).fecha_maquillaje,'2026-09-13T15:30:00.000Z');
assert.equal(edit.dateInput('2026-09-14T02:30:00Z'),'2026-09-13T21:30');
for(const changes of [{saldo:'0'},{fecha_evento:''},{fecha_prueba_final:'2026-02-30'},{fecha_maquillaje:'2026-09-13T25:99'},{cliente_email:'invalid'},{fecha_entrega_evento:'2026-09-13'}])assert.throws(()=>edit.validateCalendarPatch(changes));
const contract={id:'demo',cliente_nombre:'Cliente ficticia',fecha_cita_medidas:'2026-09-01',fecha_prueba_final:'2026-09-07',sede_id:'demo-sede',items:[]};let queries=[],auth=true,profile={rol:'admin',sede_id:null,nombre:'Prueba'},logCount=0;
const db={rpc:async()=>({data:[],error:null}),auth:{getUser:async()=>({data:{user:auth?{id:'test'}:null},error:!auth})},from(table){let patch=null;const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(k,v){filters.push([k,v]);return q},update(p){patch=p;return q},insert(){logCount++;return Promise.resolve({error:null})},async single(){return table==='profiles'?{data:profile}:{data:{...contract}}},async maybeSingle(){queries.push(patch);if(filters.some(([k,v])=>contract[k]!==v))return {data:null};Object.assign(contract,patch);return {data:{...contract}}}};return q;}};
const {PATCH}=compile('app/api/contratos/calendario/route.ts',{'@supabase/supabase-js':{createClient:()=>db},'next/server':{NextResponse:Response},'@/lib/contract-calendar':cal,'@/lib/calendar-edit':edit,'@/lib/availability':{generateBlockedRanges:()=>[]}});
const request=(changes,original,headers=true)=>new Request('http://localhost/api/contratos/calendario',{method:'PATCH',headers:headers?{authorization:'Bearer test','Content-Type':'application/json'}:{},body:JSON.stringify({id:'demo',changes,original})});
(async()=>{
 assert.equal((await PATCH(request({}, {},false))).status,401);
 auth=false;assert.equal((await PATCH(request({cliente_nombre:'Otro'},{cliente_nombre:'Cliente ficticia'}))).status,401);auth=true;
 assert.equal((await PATCH(request({cliente_nombre:'Otro'},{cliente_nombre:'Stale'}))).status,409);
 assert.equal((await PATCH(request({fecha_cita_medidas:'2026-09-10'},{fecha_cita_medidas:'2026-09-01'}))).status,400);
 const saved=await PATCH(request({fecha_cita_medidas:'2026-09-02'},{fecha_cita_medidas:'2026-09-01'}));assert.equal(saved.status,200);assert.equal((await saved.json()).contract.fecha_cita_medidas,'2026-09-02');assert.equal(contract.fecha_cita_medidas,'2026-09-02');assert.equal(logCount,1);
 profile={rol:'CONTABILIDAD',sede_id:'demo-sede'};assert.equal((await PATCH(request({cliente_nombre:'Otro'},{cliente_nombre:'Cliente ficticia'}))).status,403);
 profile={rol:'asesora',sede_id:null};assert.equal((await PATCH(request({cliente_nombre:'Otro'},{cliente_nombre:'Cliente ficticia'}))).status,403);
 console.log('PASS: dates, Bogotá time, field allowlist, authentication, profile authorization, stale edit, chronological order, save read-back, audit log');
})().catch(e=>{console.error(e);process.exitCode=1});

