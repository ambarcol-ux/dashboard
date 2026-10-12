import {createClient} from '@supabase/supabase-js';
import {crmBookingEvent,type CrmEventRow} from '@/lib/first-visit-crm';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function server(){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||key==='[SENSITIVE]'||!process.env.NEXT_PUBLIC_SUPABASE_URL)throw Error('No configurado');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
}
// The CRM Apps Script pulls ERP bookings here (worker secret) and feeds them to its Cal.com receiver.
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return reply({error:'No autorizado'},401);
 try{
  const body=JSON.parse((await request.text()).slice(0,8192)||'{}'),db=server();
  if(body.accion==='tomar'){
   const origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN||new URL(request.url).origin,secret=process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY!;
   const eventos:{id:string;evento:ReturnType<typeof crmBookingEvent>}[]=[];
   for(let i=0,limit=Math.min(20,Math.max(1,Number(body.limite)||10));i<limit;i++){
    const {data,error}=await db.rpc('tomar_evento_crm_primera_cita');
    if(error)return reply({error:'No se pudo consultar la cola.'},503);
    if(!data)break;
    eventos.push({id:data.id,evento:crmBookingEvent(data as CrmEventRow,origin,secret)});
   }
   return reply({eventos});
  }
  if(body.accion==='resultado'){
   if(!/^[0-9a-f-]{36}$/i.test(String(body.id)))return reply({error:'Evento no válido.'},400);
   const ok=body.ok===true;
   const {error}=await db.from('primeras_citas_eventos_crm').update({estado:ok?'entregado':'error',respuesta:String(body.respuesta||'').slice(0,500)||null,updated_at:new Date().toISOString()}).eq('id',String(body.id)).eq('estado','enviando');
   if(error)return reply({error:'No se pudo registrar el resultado.'},503);
   return reply({ok:true});
  }
  return reply({error:'Acción no permitida.'},400);
 }catch{return reply({error:'La cola del CRM no está disponible.'},503);}
}
