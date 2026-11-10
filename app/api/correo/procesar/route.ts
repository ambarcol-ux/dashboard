import {publicServerClient} from '@/lib/public-db';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {authLink} from '@/lib/data-authorization';
import {sendEmail,type EmailConnection} from '@/lib/email-providers';
import {AUTH_REQUEST_ID,catalogLink,renderMail} from '@/lib/email-marketing';
import {promoBenefit,type Promotion} from '@/lib/promotions';
export const dynamic='force-dynamic';
export const maxDuration=60;

type Job={id:number;automatizacion_id:string|null;campana_id:string|null;cita_id:string|null;contrato_id:string|null;autorizacion_id:string|null;promocion_id:string|null;email:string;nombre:string|null;intentos:number};
const reply=(d:unknown,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'no-store'}});
const dmy=(d:string|null|undefined)=>d?d.slice(0,10).split('-').reverse().join('/'):'';

/** Called every 10 minutes by Supabase (pg_cron): queues due automations and sends what the frequency rules allow. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return reply({error:'No autorizado'},401);
 try{
  const db=publicServerClient(),origin=(process.env.FIRST_VISIT_PUBLIC_ORIGIN||new URL(request.url).origin).replace(/\/$/,'');
  const {data:conn}=await db.rpc('integracion_correo_servidor');
  if(!conn?.secreto||!conn.activo)return reply({activo:false,motivo:'Sin conexión de correo'});
  const {data:estado}=await db.from('integraciones').select('estado').eq('id','correo').single();
  if(estado?.estado!=='conectada')return reply({activo:false,motivo:'La conexión de correo no está probada'});
  const {data:encolados}=await db.rpc('correo_encolar_automatizaciones');
  const {data:tomados,error}=await db.rpc('correo_tomar_envios',{p_limite:20});
  if(error)return reply({error:'No se pudo leer la cola'},503);
  const jobs=(tomados?.envios||[]) as Job[];
  const [{data:autos},{data:sedes}]=await Promise.all([db.from('correo_automatizaciones').select('id,asunto,cuerpo'),db.from('sedes').select('id,nombre,resena_url')]);
  let enviados=0,errores=0;
  for(const j of jobs){
   let estadoFinal='error',motivo:string|null=null,providerId:string|null=null,asunto:string|null=null;
   try{
    const plantilla=j.automatizacion_id?(autos||[]).find(a=>a.id===j.automatizacion_id):(await db.from('correo_campanas').select('asunto,cuerpo').eq('id',j.campana_id!).single()).data;
    const {data:aut}=j.autorizacion_id?await db.from('autorizaciones_datos').select('token,estado,comercial').eq('id',j.autorizacion_id).single():{data:null};
    if(!plantilla)throw Error('Sin plantilla');
    const solicitud=j.automatizacion_id===AUTH_REQUEST_ID;
    // The request goes only to people who have not answered yet; everything else only with commercial authorization.
    if(solicitud?(!aut||aut.estado==='revocada'||aut.comercial):(!aut||aut.estado!=='autorizada'||!aut.comercial)){estadoFinal='omitido';motivo=solicitud?'Ya respondió la autorización':'Sin autorización comercial vigente';}
    else{
     const o=`correo-${j.automatizacion_id||'campana'}`;
     let tel='';
     const values:Record<string,string>={nombre:(j.nombre||'').split(/\s+/)[0]||'',sede:'',enlace_cita:`${origin}/agendar-primera-cita?o=${o}`,catalogo:'',promocion:'',beneficio:'',condiciones:'',vigencia:'',fecha_evento:'',resena:''};
     if(j.cita_id){
      const {data:c}=await db.from('primeras_citas').select('sede_id,tipo_vestido,fecha_evento,telefono').eq('id',j.cita_id).single();
      const sede=(sedes||[]).find(s=>s.id===c?.sede_id)?.nombre||'';tel=c?.telefono||'';
      Object.assign(values,{sede,fecha_evento:dmy(c?.fecha_evento),enlace_cita:`${origin}/agendar-primera-cita?${new URLSearchParams({...(c?.sede_id?{sede:c.sede_id}:{}),o})}`});
      values.catalogo=catalogLink(origin,sede,c?.tipo_vestido,o)||values.enlace_cita;
     }
     if(j.contrato_id){const {data:k}=await db.from('contratos').select('sede_id,cliente_whatsapp,whatsapp').eq('id',j.contrato_id).single();values.sede=(sedes||[]).find(s=>s.id===k?.sede_id)?.nombre||'';tel=k?.cliente_whatsapp||k?.whatsapp||'';}
     if(j.promocion_id){
      const {data:p}=await db.from('promociones').select('*').eq('id',j.promocion_id).single();
      if(p)Object.assign(values,{promocion:p.nombre,beneficio:promoBenefit(p as Promotion),condiciones:p.condiciones||'',vigencia:dmy(p.hasta)});
     }
     values.resena=(sedes||[]).find(s=>s.nombre===values.sede)?.resena_url||'';
     // At most one review request every 6 months per person, and never with an open complaint in the 304 chat.
     if(values.resena&&plantilla.cuerpo.includes('{resena}')){const {data:ok,error:e}=await db.rpc('resena_permitida',{p_telefono:tel,p_email:j.email});if(e||ok!==true)values.resena='';}
     values.enlace_autorizacion=authLink(origin,aut!.token);
     // Without the store's Google review link, the paragraph that asks for the review is left out.
     const cuerpo=values.resena?plantilla.cuerpo:plantilla.cuerpo.split(/\n{2,}/).filter((p:string)=>!p.includes('{resena}')).join('\n\n');
     const mail=renderMail(plantilla.asunto,cuerpo,values,authLink(origin,aut!.token),solicitud);
     asunto=mail.asunto;
     const r=await sendEmail(conn as EmailConnection,{to:j.email,nombre:j.nombre,...mail});
     if(r.ok){estadoFinal='enviado';providerId=r.detalle||null;enviados++;
      if(values.resena&&plantilla.cuerpo.includes('{resena}'))await db.from('resenas_solicitudes').insert({telefono:String(tel).replace(/\D/g,'').slice(-10)||null,email:j.email,canal:'correo',origen:j.contrato_id?'contrato':'visita',cita_id:j.cita_id||null,contrato_id:j.contrato_id||null,sede_id:(sedes||[]).find(s=>s.nombre===values.sede)?.id||null});}
     else{motivo=r.error;errores++;}
    }
   }catch(e){motivo=e instanceof Error?e.message:'Error al preparar el correo';errores++;}
   // A failed send goes back to the queue (up to 3 attempts, one hour apart).
   const retry=estadoFinal==='error'&&j.intentos<3;
   await db.from('correo_envios').update({estado:retry?'pendiente':estadoFinal,motivo,provider_id:providerId,asunto,
    ...(estadoFinal==='enviado'?{enviado_at:new Date().toISOString()}:{}),...(retry?{programado_at:new Date(Date.now()+3600000).toISOString()}:{})}).eq('id',j.id);
  }
  return reply({encolados:encolados||0,tomados:jobs.length,enviados,errores,motivo:tomados?.motivo||null});
 }catch{return reply({error:'El servicio no está disponible.'},503);}
}
