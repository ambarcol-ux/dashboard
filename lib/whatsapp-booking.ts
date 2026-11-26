import {createHmac,randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {sendWhatsappList,sendWhatsappButtons,sendWhatsappText} from './whatsapp-inbox';
import {loadAuthTexts,registerAuthorization} from './data-authorization';

/** Primera cita agendada dentro del chat de WhatsApp, sin formulario: la clienta elige un horario de la lista, acepta el uso de sus
 *  datos (Ley 1581, texto vigente de Configuración › Autorizaciones) con un botón y la cita queda reservada con su nombre y celular.
 *  Usa la misma reserva que el enlace público (cupos, una cita pendiente por celular, límite de intentos); la confirmación, el
 *  anuncio de origen y los recordatorios los ponen los disparadores que ya existen al crear la cita.
 *  Botones: ag_s_<p|v>_<AAAAMMDD>_<HH>_<Q|G|N> horario elegido · ag_k_… sí, reservar · ag_o_<p|v>_<Q|G|N>_<AAAAMMDD> más horarios.
 *  Si ya tiene una primera cita pendiente, la lista es para cambiarla (sin cédula): ag_m_<AAAAMMDD>_<HH> nuevo horario · ag_n_<AAAAMMDD> más días. */
type Settings={token:string;phoneNumberId:string};
const TIPO:Record<string,string>={Q:'Quince',G:'Gala',N:'Novia'},TIPO_COD:Record<string,string>={Quince:'Q',Gala:'G',Novia:'N'};
const zona='America/Bogota';
const hoyMas=(d:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:zona}).format(new Date(Date.now()+d*86400000));
const compacta=(f:string)=>f.replace(/-/g,''),larga=(f:string)=>`${f.slice(0,4)}-${f.slice(4,6)}-${f.slice(6,8)}`;
/** «sáb 22 nov · 3:00 p. m.» (24 characters max, WhatsApp list rows). */
export function etiquetaHorario(fecha:string,hora:string){
 const d=new Date(`${fecha}T12:00:00-05:00`);
 const dia=new Intl.DateTimeFormat('es-CO',{timeZone:zona,weekday:'short',day:'numeric',month:'short'}).format(d).replace(/\./g,'').replace(',','').replace(' de ',' ');
 const h=Number(hora.slice(0,2));
 return `${dia} · ${h%12||12}:00 ${h<12?'a. m.':'p. m.'}`.slice(0,24);
}

/** Free first-visit slots from a date on (at least 3 hours ahead), up to «max», looking 21 days ahead. */
export async function horariosLibres(db:SupabaseClient,sedeId:string,modalidad:'presencial'|'virtual',max=9,desde?:string){
 const out:{fecha:string;hora:string}[]=[],limite=Date.now()+3*3600000;
 for(let i=0;i<21&&out.length<max;i++){
  const fecha=hoyMas(i);if(desde&&fecha<=desde)continue;
  const {data}=await db.rpc('disponibilidad_primera_cita',{p_fecha:fecha,p_modalidad:modalidad,p_sede:sedeId});
  for(const s of (Array.isArray(data)?data:[]) as {hora:string;cupos:number}[])
   if(s.cupos>0&&Date.parse(`${fecha}T${s.hora}:00-05:00`)>limite&&out.length<max)out.push({fecha,hora:s.hora.slice(0,5)});
 }
 return out;
}

async function guardar(db:SupabaseClient,conversacion:string,waId:string,texto:string,origen:'ia'|'erp'){
 const at=new Date().toISOString();
 await db.from('whatsapp_mensajes').insert({conversacion_id:conversacion,wa_id:waId,direccion:'saliente',origen,tipo:'automatico',texto,estado:'sent',created_at:at});
 await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:at}).eq('id',conversacion);
}
type Pendiente={id:string;modalidad:'presencial'|'virtual';sede_id:string;fecha:string;hora:string;updated_at:string};
async function citaPendiente(db:SupabaseClient,telefono:string){
 const {data}=await db.from('primeras_citas').select('id,modalidad,sede_id,fecha,hora,updated_at').eq('telefono',telefono).gte('fecha',hoyMas(0)).in('estado',['agendada','confirmada']).order('fecha').limit(1).maybeSingle();
 return (data as Pendiente|null)||null;
}

/** She already has a pending first visit: free slots to move it (same store and mode), changed with one tap and no ID number. */
async function enviarCambio(db:SupabaseClient,settings:Settings,c:{conversacion:string;telefono:string},cita:Pendiente,desde?:string,origen:'ia'|'erp'='ia'){
 const libres=(await horariosLibres(db,cita.sede_id,cita.modalidad,9,desde)).filter(s=>!(s.fecha===cita.fecha&&s.hora===cita.hora.slice(0,5)));
 if(!libres.length){
  const texto='En los próximos días no quedan otros horarios libres. Escríbeme qué día te sirve y lo revisamos con la sede 💛';
  await guardar(db,c.conversacion,await sendWhatsappText(settings,c.telefono,texto),texto,origen);return;
 }
 const filas=libres.map(s=>({id:`ag_m_${compacta(s.fecha)}_${s.hora.slice(0,2)}`,titulo:etiquetaHorario(s.fecha,s.hora)}));
 filas.push({id:`ag_n_${compacta(libres[libres.length-1].fecha)}`,titulo:'Ver más días'});
 const texto=`Tu cita está para el ${etiquetaHorario(cita.fecha,cita.hora.slice(0,5))}. Si quieres cambiarla, toca «Cambiar horario» y elige el nuevo 📅`;
 await guardar(db,c.conversacion,await sendWhatsappList(settings,c.telefono,texto,'Cambiar horario',filas),`${texto}\n[${filas.map(f=>f.titulo).join(' · ')}]`,origen);
}

/** Sends the list of free slots of her store. Returns false when it could not (no store, a pending visit, no slots). */
export async function enviarHorarios(db:SupabaseClient,settings:Settings,c:{conversacion:string;telefono:string;sede_id:string|null},modalidad:'presencial'|'virtual',tipo:string,desde?:string,origen:'ia'|'erp'='ia'){
 if(!/^\d{10,15}$/.test(c.telefono))return false;
 const pendiente=await citaPendiente(db,c.telefono);
 if(pendiente){await enviarCambio(db,settings,c,pendiente,desde,origen);return true;}
 if(!c.sede_id)return false;
 const libres=await horariosLibres(db,c.sede_id,modalidad,9,desde);
 const t=TIPO_COD[tipo]||'Q',m=modalidad==='virtual'?'v':'p';
 if(!libres.length){
  const texto='En los próximos días no quedan horarios libres por aquí. Escríbeme qué día te sirve y lo revisamos con la sede 💛';
  await guardar(db,c.conversacion,await sendWhatsappText(settings,c.telefono,texto),texto,origen);return true;
 }
 const filas=libres.map(s=>({id:`ag_s_${m}_${compacta(s.fecha)}_${s.hora.slice(0,2)}_${t}`,titulo:etiquetaHorario(s.fecha,s.hora)}));
 filas.push({id:`ag_o_${m}_${t}_${compacta(libres[libres.length-1].fecha)}`,titulo:'Ver más días'});
 const texto=`Estos son los horarios libres para tu cita ${modalidad==='virtual'?'virtual':'en la sede'} (1 hora, sin costo). Toca «Elegir horario» y escoge el que te sirva 📅`;
 await guardar(db,c.conversacion,await sendWhatsappList(settings,c.telefono,texto,'Elegir horario',filas),`${texto}\n[${filas.map(f=>f.titulo).join(' · ')}]`,origen);
 return true;
}

/** Answers the booking buttons (ag_…): chosen slot → authorization and confirmation; «Sí, reservar» → books; «Ver más días» → more slots. */
export async function manejarAgenda(db:SupabaseClient,settings:Settings,a:{conversacion:string;telefono:string;sede_id:string|null;accion:string}){
 const origin=(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'');
 // Commercial authorization (Ley 1581), offered after booking: «Sí, quiero promos» records it with the text in force; «No, gracias» changes nothing.
 if(a.accion==='ag_c_si'||a.accion==='ag_c_no'){
  let texto='Entendido 💛 Solo te escribiremos sobre tu cita.';
  if(a.accion==='ag_c_si'){
   const {data:conv}=await db.from('whatsapp_conversaciones').select('nombre').eq('id',a.conversacion).maybeSingle();
   await registerAuthorization(db,{telefono:a.telefono,nombre:conv?.nombre||null,sede:a.sede_id,origen:'agendamiento',tratamiento:true,comercial:true,pendiente:false});
   const cita=await citaPendiente(db,a.telefono);
   if(cita?.id)await db.from('primeras_citas_historial').insert({cita_id:cita.id,accion:'Autorización comercial por WhatsApp',detalle:'La clienta aceptó recibir promociones y novedades con el botón del chat de WhatsApp.'});
   texto='¡Gracias! 💛 Te avisaremos de promociones y novedades. Puedes retirar esta autorización cuando quieras escribiéndonos.';
  }
  await guardar(db,a.conversacion,await sendWhatsappText(settings,a.telefono,texto),texto,'erp');return;
 }
 // Moving her pending visit (ag_n more days, ag_m new time): the same reschedule the reminder buttons use, no ID number.
 const masCambio=a.accion.match(/^ag_n_(\d{8})$/),cambio=a.accion.match(/^ag_m_(\d{8})_(\d{2})$/);
 if(masCambio||cambio){
  const cita=await citaPendiente(db,a.telefono);
  if(!cita){const texto='No encuentro una primera cita pendiente con este número. Si quieres, te ayudo a agendar una nueva 💛';await guardar(db,a.conversacion,await sendWhatsappText(settings,a.telefono,texto),texto,'erp');return;}
  if(masCambio){await enviarCambio(db,settings,a,cita,larga(masCambio[1]),'erp');return;}
  const fecha=larga(cambio![1]),hora=`${cambio![2]}:00`;
  const {error}=await db.rpc('accion_cliente_primera_cita',{p_id:cita.id,p_accion:'reprogramar',p_datos:{version:cita.updated_at,fecha,hora,modalidad:cita.modalidad,sede:cita.sede_id,motivo:'Reprogramada por la clienta desde el chat de WhatsApp'}});
  if(error){const texto='Ese horario se acaba de ocupar 🙈 Te envío los que siguen libres:';await guardar(db,a.conversacion,await sendWhatsappText(settings,a.telefono,texto),texto,'erp');await enviarCambio(db,settings,a,cita,undefined,'erp');return;}
  const texto=`¡Listo! 🎉 Tu cita quedó para el ${etiquetaHorario(fecha,hora)}. Te esperamos 💛`;
  await guardar(db,a.conversacion,await sendWhatsappText(settings,a.telefono,texto),texto,'erp');return;
 }
 const mas=a.accion.match(/^ag_o_([pv])_([QGN])_(\d{8})$/);
 if(mas){await enviarHorarios(db,settings,a,mas[1]==='v'?'virtual':'presencial',TIPO[mas[2]],larga(mas[3]),'erp');return;}
 const p=a.accion.match(/^ag_([sk])_([pv])_(\d{8})_(\d{2})_([QGN])$/);if(!p||!a.sede_id)return;
 const [,paso,m,f,h,t]=p,fecha=larga(f),hora=`${h}:00`,modalidad=m==='v'?'virtual':'presencial';
 const {data:sede}=await db.from('sedes').select('nombre,direccion_clientes,direccion,telefono').eq('id',a.sede_id).maybeSingle();
 const lugar=modalidad==='virtual'?'virtual':`en ${sede?.nombre||'la sede'}`,cuando=etiquetaHorario(fecha,hora);
 if(paso==='s'){
  // Before booking: the processing authorization (Ley 1581) with the text in force, accepted with the button.
  const {tratamiento}=await loadAuthTexts(db);
  const texto=`Perfecto: tu cita ${lugar}, ${cuando}.\n\nPara reservarla: ${tratamiento?.texto||'autorizo a Ámbar Couture a usar mis datos personales para gestionar mi cita (Ley 1581 de 2012).'}\n\nAl tocar «Sí, reservar» aceptas esta autorización.`;
  await guardar(db,a.conversacion,await sendWhatsappButtons(settings,a.telefono,texto,[{id:`ag_k_${m}_${f}_${h}_${t}`,titulo:'Sí, reservar'},{id:`ag_o_${m}_${t}_${compacta(hoyMas(0))}`,titulo:'Otro horario'}]),`${texto}\n[Sí, reservar · Otro horario]`,'erp');
  return;
 }
 // «Sí, reservar»: same booking as the public link (capacity, one pending visit per phone, attempt limit).
 const {data:conv}=await db.from('whatsapp_conversaciones').select('nombre').eq('id',a.conversacion).maybeSingle();
 const nombre=String(conv?.nombre||'').replace(/[^\p{L}\p{M}' .-]/gu,'').trim().slice(0,120)||'Clienta WhatsApp';
 const id=randomUUID(),limite=createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`wa:${a.telefono}`).digest('hex');
 const {data,error}=await db.rpc('reservar_primera_cita_completa',{p_id:id,p_fecha:fecha,p_hora:hora,p_modalidad:modalidad,p_sede:a.sede_id,p_nombre:nombre.length>=2?nombre:'Clienta WhatsApp',p_telefono:a.telefono,p_email:'',p_consentimiento:true,p_limite:limite,p_fecha_evento:null,p_tipo_vestido:TIPO[t]});
 const r=(data||{}) as {reservada?:boolean;error?:string};
 if(error||!r.reservada){
  if(r.error?.startsWith('Ya tienes una primera cita pendiente')){
   const cita=await citaPendiente(db,a.telefono);
   if(cita){await enviarCambio(db,settings,a,cita,undefined,'erp');return;}
   const texto='Ya tienes una primera cita reservada 💛 Si quieres cambiarla, aquí eliges el nuevo horario:';
   await guardar(db,a.conversacion,await sendWhatsappButtons(settings,a.telefono,texto,{titulo:'Cambiar mi cita',url:`${origin}/reprogramar-primera-cita`}),texto,'erp');return;
  }
  const texto='Ese horario se acaba de ocupar 🙈 Te envío los que siguen libres:';
  await guardar(db,a.conversacion,await sendWhatsappText(settings,a.telefono,texto),texto,'erp');
  await enviarHorarios(db,settings,a,modalidad,TIPO[t],undefined,'erp');return;
 }
 await db.from('primeras_citas').update({origen_enlace:'whatsapp-chat'}).eq('id',id).is('origen_enlace',null);
 await db.from('primeras_citas_historial').insert({cita_id:id,accion:'Reserva por WhatsApp',detalle:'Reservada por la clienta con los botones del chat de WhatsApp (aceptó la autorización de datos con «Sí, reservar»).'});
 try{const {tratamiento}=await loadAuthTexts(db);
  await registerAuthorization(db,{telefono:a.telefono,nombre,sede:a.sede_id,origen:'agendamiento',tratamiento:true,comercial:false,pendiente:false,versionTratamiento:tratamiento?String(tratamiento.version):null});
 }catch(e){console.error('Autorización de datos (WhatsApp) no registrada:',e);}
 const dir=modalidad==='presencial'?(sede?.direccion_clientes||sede?.direccion||''):'';
 const texto=`¡Listo, ${nombre.split(' ')[0]}! 🎉 Tu cita quedó reservada ${lugar}, ${cuando}${dir?` (${dir})`:''}. En un momento te llega la confirmación con todos los detalles.${sede?.telefono?`\n\n📞 Si tienes alguna duda, llama a la sede ${sede.nombre}: ${sede.telefono}`:''}\n\nPara tener tus datos completos, ¿me escribes tu nombre y apellido y tu correo? (si prefieres no darlos, no pasa nada 💛)`;
 await guardar(db,a.conversacion,await sendWhatsappText(settings,a.telefono,texto),texto,'erp');
 // Then the optional commercial authorization with buttons (separate from the one for the visit).
 try{const {comercial}=await loadAuthTexts(db);
  const t2=`¿Quieres recibir promociones y novedades? ${comercial?.texto||'Acepto recibir de Ámbar Couture información comercial, promociones y novedades. Puedo retirar esta autorización en cualquier momento.'}`;
  await guardar(db,a.conversacion,await sendWhatsappButtons(settings,a.telefono,t2,[{id:'ag_c_si',titulo:'Sí, quiero promos'},{id:'ag_c_no',titulo:'No, gracias'}]),`${t2}\n[Sí, quiero promos · No, gracias]`,'erp');
 }catch(e){console.error('Autorización comercial (WhatsApp) no enviada:',e);}
}
