const assert=require('node:assert/strict'),compile=require('./compile.cjs');
process.env.SUPABASE_SERVICE_ROLE_KEY='test-secret';process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid';process.env.FIRST_VISIT_WORKER_SECRET='worker';delete process.env.FIRST_VISIT_MESSAGES_ENABLED;
let queue=[],updates=[],rpcs=[];
const cita={id:'00000000-0000-0000-0000-000000000001',fecha:'2026-10-20',hora:'09:00:00',cliente_nombre:'Ana',telefono:'3001234567',sede_id:'s1',modalidad:'presencial'};
const db={rpc:async(name,args)=>{rpcs.push({name,args});if(name==='tomar_mensaje_primera_cita')return {data:queue.shift()??null,error:null};return {data:true,error:null};},from:()=>({update:v=>({eq:(k1,v1)=>({eq:async()=>{updates.push({v,id:v1});return {error:null};}})})})};
const api=compile('app/api/primeras-citas/whatsapp-script/route.ts',{'@supabase/supabase-js':{createClient:()=>db}});
const req=(body,auth='Bearer worker')=>new Request('https://erp.test/api/primeras-citas/whatsapp-script',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:auth}:{})},body:JSON.stringify(body)});
(async()=>{
 assert.equal((await api.POST(req({accion:'tomar'},null))).status,401);
 queue=[{mensaje:{id:'11111111-1111-1111-1111-111111111111',tipo:'confirmacion'},cita,sede:'Bogotá'},{omitido:true},{mensaje:{id:'22222222-2222-2222-2222-222222222222',tipo:'correo_interno'},cita,sede:'Bogotá'},{mensaje:{id:'33333333-3333-3333-3333-333333333333',tipo:'desconocido'},cita,sede:'Bogotá'}];
 let r=await api.POST(req({accion:'tomar',limite:5}));assert.equal(r.status,200);const {mensajes}=await r.json();
 assert.equal(mensajes.length,2);
 assert.equal(mensajes[0].canal,'whatsapp');assert.equal(mensajes[0].payload.to,'573001234567');assert.equal(mensajes[0].payload.template.name,'ambar_confirmacion_cita');
 assert.equal(mensajes[1].canal,'correo');assert.match(mensajes[1].texto,/dashboard\/primeras-citas/);
 assert.equal(updates[0].v.estado,'revisar');// unsupported type is never sent blindly
 updates=[];
 assert.equal((await api.POST(req({accion:'resultado',id:'11111111-1111-1111-1111-111111111111',estado:'enviado',provider_id:'wamid.X'}))).status,200);
 assert.equal((await api.POST(req({accion:'resultado',id:'22222222-2222-2222-2222-222222222222',estado:'error',error:'400'}))).status,200);
 assert.equal(updates[0].v.provider_id,'wamid.X');assert.ok(updates[1].v.programado_at);
 assert.equal((await api.POST(req({accion:'resultado',id:'11111111-1111-1111-1111-111111111111',estado:'borrado'}))).status,400);
 rpcs=[];
 const evento={entry:[{changes:[{value:{statuses:[{id:'wamid.X',status:'delivered',timestamp:'1791772800',recipient_id:'573001234567'}],messages:[{id:'wamid.R',from:'573001234567',context:{id:'wamid.X'},button:{payload:'pc_asisti'}}]}}]}]};
 assert.equal((await api.POST(req({accion:'webhook',evento}))).status,200);
 assert.deepEqual(rpcs.map(x=>x.name),['estado_whatsapp_primera_cita','respuesta_whatsapp_primera_cita']);
 process.env.FIRST_VISIT_MESSAGES_ENABLED='true';
 assert.equal((await api.POST(req({accion:'tomar'}))).status,409);
 console.log('PASS: Apps Script WhatsApp relay: worker auth, rendered jobs, results, forwarded Meta events and single sender');
})().catch(e=>{console.error(e);process.exitCode=1});
