const assert=require('node:assert/strict'),compile=require('./compile.cjs');
process.env.SUPABASE_SERVICE_ROLE_KEY='test-secret';process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='anon';
const id='00000000-0000-0000-0000-000000000009';
let rpcError=null,deleted=[];
const client=(url,key)=>({
 rpc:async(name,args)=>{assert.equal(key,'anon');assert.equal(name,'preparar_eliminacion_primera_cita');assert.equal(args.p_id,id);return {error:rpcError};},
 from:table=>({delete:()=>({eq:async(col,val)=>{assert.equal(key,'test-secret');deleted.push(`${table}.${col}=${val}`);return {error:null};}})}),
});
const api=compile('app/api/primeras-citas/gestionar/route.ts',{'@supabase/supabase-js':{createClient:client}});
const req=(b,h={})=>new Request('https://erp.test/api/primeras-citas/gestionar',{method:'POST',headers:{'content-type':'application/json',...h},body:JSON.stringify(b)});
(async()=>{
 assert.equal((await api.POST(req({accion:'eliminar',id,motivo:'prueba',version:'v'}))).status,401);
 assert.equal((await api.POST(req({accion:'eliminar',id:'x',motivo:'prueba'},{authorization:'Bearer u'}))).status,400);
 rpcError={code:'42501',message:'No tienes permiso para eliminar citas.'};
 const denied=await api.POST(req({accion:'eliminar',id,motivo:'prueba',version:'v'},{authorization:'Bearer u'}));
 assert.equal(denied.status,400);assert.equal((await denied.json()).error,'No tienes permiso para eliminar citas.');assert.equal(deleted.length,0);
 rpcError=null;
 assert.equal((await api.POST(req({accion:'eliminar',id,motivo:'Cita de prueba',version:'v'},{authorization:'Bearer u'}))).status,200);
 assert.deepEqual(deleted,['primeras_citas_mensajes.cita_id='+id,'primeras_citas_correos.cita_id='+id,'primeras_citas_seguimientos.cita_id='+id,'primeras_citas_historial.cita_id='+id,'primeras_citas.id='+id]);
 console.log('PASS delete: needs a session, the database permission check runs first, rows are removed only after it passes');
})().catch(e=>{console.error(e);process.exitCode=1});
