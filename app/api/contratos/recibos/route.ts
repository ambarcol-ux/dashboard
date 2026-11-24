import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {sendOptionalTemplate,sendWhatsappText,WINDOW_MS} from '@/lib/whatsapp-inbox';
import {sendEmail,type EmailConnection} from '@/lib/email-providers';
import {sendSigningRequest,type FirmaPendiente} from '@/lib/contract-delivery';
export const dynamic='force-dynamic';
export const maxDuration=60;

type Recibo={id:string;tipo:'pago'|'deposito'|'devolucion';valor:number;medio:string|null;contrato:string;nombre:string|null;telefono:string|null;email:string|null;sede:string|null;saldo:number;deposito:number};
const cop=(n:number)=>`$${Math.round(Number(n||0)).toLocaleString('es-CO')}`;
const wa=(t:string)=>{const d=t.replace(/\D/g,'');return d.length===10?`57${d}`:d;};
const medioTxt=(m:string|null)=>/efectivo/i.test(m||'')?'efectivo':/transfer/i.test(m||'')?'transferencia':/tarjeta/i.test(m||'')?'tarjeta':'otro medio';

/** Receipt texts (templates in docs/plantillas-whatsapp.md, created with «Crear plantillas en Meta»). */
function mensaje(r:Recibo){
 const n=(r.nombre||'').trim().split(/\s+/)[0]||'hola',sede=(r.sede||'').trim()||'Colombia',m=medioTxt(r.medio);
 if(r.tipo==='pago'){const v=[n,sede,cop(r.valor),m,r.contrato,cop(r.saldo)];
  return {name:'ambar_recibo_pago',values:v,texto:`Hola ${v[0]} 💛 Ámbar Couture ${v[1]} registró tu pago de ${v[2]} en ${v[3]} para el contrato ${v[4]}. Saldo pendiente: ${v[5]}. Si no reconoces este pago o el valor no es correcto, responde este mensaje.`};}
 if(r.tipo==='deposito'){const v=[n,sede,cop(r.valor),m,r.contrato];
  return {name:'ambar_deposito_recibido',values:v,texto:`Hola ${v[0]} 💛 Ámbar Couture ${v[1]} registró tu depósito en garantía de ${v[2]} en ${v[3]} para el contrato ${v[4]}. Se devuelve al terminar el alquiler según tu contrato. Si no reconoces este valor, responde este mensaje.`};}
 const v=[n,sede,cop(r.valor),m,r.contrato];
 return {name:'ambar_deposito_devuelto',values:v,texto:`Hola ${v[0]} 💛 Ámbar Couture ${v[1]} registró la devolución de tu depósito por ${v[2]} en ${v[3]} del contrato ${v[4]}. Si no la recibiste o el valor no es correcto, responde este mensaje.`};
}

/** After each payment, deposit or deposit return reaches the cash register (and every 30 minutes for pending ones): the customer gets her
 *  receipt by WhatsApp (free text inside the 24-hour window, else the approved template) and by e-mail when she has one. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 // {"solo":"firma"} (every 5 minutes): unsigned drafts get the contract to their e-mail for signature, then the reminders (lib/contract-delivery.ts).
 if(((await request.json().catch(()=>({}))) as {solo?:string}).solo==='firma'){
  const {data:conn}=await db.rpc('integracion_correo_servidor');
  if(!conn?.secreto||!conn.activo)return Response.json({enviados:0,errores:['Sin conexión de correo activa.']});
  const {data:pendientes,error:e}=await db.rpc('contratos_firma_por_enviar',{p_limite:20});
  if(e)return Response.json({error:e.message},{status:500});
  const origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN||new URL(request.url).origin;let enviados=0;const errores:string[]=[];
  for(const k of (pendientes||[]) as FirmaPendiente[]){
   try{await sendSigningRequest(db,conn as EmailConnection,k,origin);enviados++;}
   catch(x){const m=(x instanceof Error?x.message:'Error').slice(0,300);errores.push(m);
    // Logged as a send so a bad address waits for the next reminder instead of retrying every 5 minutes.
    await db.from('bitacora_contratos').insert({contrato_id:k.id,accion:'Contrato enviado para firma',detalle:`No se pudo enviar: ${m}`});}
  }
  return Response.json({enviados,errores});
 }
 const {data,error}=await db.rpc('recibos_clienta_tomar',{p_limite:20});
 if(error)return Response.json({error:error.message},{status:500});
 const settings=await loadWhatsappSettings(db);
 const {data:conn}=await db.rpc('integracion_correo_servidor');
 let enviados=0;const errores:string[]=[];
 for(const r of (data||[]) as Recibo[]){
  const t=mensaje(r),vias:string[]=[];
  try{
   const tel=String(r.telefono||'').replace(/\D/g,'');
   if(tel.length>=10&&settings.token&&settings.phoneNumberId){
    const to=wa(tel);
    const {data:conv}=await db.from('whatsapp_conversaciones').select('id,telefono,ultimo_entrante_at').like('telefono',`%${tel.slice(-10)}`).eq('canal','whatsapp').order('ultimo_at',{ascending:false}).limit(1).maybeSingle();
    const abierta=conv?.ultimo_entrante_at&&Date.now()-Date.parse(conv.ultimo_entrante_at)<WINDOW_MS;
    const waId=abierta?await sendWhatsappText(settings,conv!.telefono,t.texto):await sendOptionalTemplate(settings,to,t.name,t.values);
    if(waId){vias.push('whatsapp');
     if(conv){const at=new Date().toISOString();
      await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:waId,direccion:'saliente',origen:'erp',tipo:abierta?'automatico':'template',texto:t.texto,estado:'sent',created_at:at});
      await db.from('whatsapp_conversaciones').update({ultimo_mensaje:t.texto.slice(0,200),ultimo_at:at}).eq('id',conv.id);}
     await db.from('recibos_clienta').update({wa_id:waId}).eq('id',r.id);}
   }
   const email=String(r.email||'').trim();
   if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&conn?.secreto&&conn.activo){
    const res=await sendEmail(conn as EmailConnection,{to:email,nombre:String(r.nombre||''),asunto:`Recibo de tu ${r.tipo==='pago'?'pago':'depósito'} · contrato ${r.contrato}`,
     html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937"><p style="font-size:12px;letter-spacing:.2em;color:#b45309;font-weight:bold">ÁMBAR COUTURE</p><p>${t.texto.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!))}</p></div>`,texto:t.texto});
    if(res.ok)vias.push('correo');
   }
   if(vias.length){enviados++;await db.from('recibos_clienta').update({enviado_at:new Date().toISOString(),via:vias.join('+'),error:null}).eq('id',r.id);}
   else await db.from('recibos_clienta').update({error:tel.length<10&&!email?'La clienta no tiene WhatsApp ni correo.':'Plantilla de WhatsApp sin aprobar y sin correo.'}).eq('id',r.id);
  }catch(e){const m=e instanceof Error?e.message:'Error';errores.push(m);await db.from('recibos_clienta').update({error:m.slice(0,300)}).eq('id',r.id);}
 }
 return Response.json({enviados,errores});
}
