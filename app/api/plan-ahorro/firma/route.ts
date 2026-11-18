import {createHash} from 'node:crypto';
import {publicServerClient,publicReply,readJson,validSignature} from '@/lib/public-db';
import {registerAuthorization,loadAuthTexts} from '@/lib/data-authorization';
import {PLAN_CONTRACT_VERSION,planContractPdf,planContractText,verifyPlanSigningToken,type DatosFirmante,type PlanFirma} from '@/lib/plan-ahorro-contrato';
export const dynamic='force-dynamic';

const linkKey=()=>process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const limpio=(v:unknown,max:number)=>String(v||'').replace(/[<>]/g,'').trim().slice(0,max);

/** Public page /plan-ahorro-firma: the private link decides the plan; the family reads the contract with its data, signs it and
 *  gets the signed copy. The browser never reads the database. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let body:Record<string,unknown>;
 try{body=await readJson(request,1_600_000);}catch{return publicReply({error:'Datos no válidos.'},400);}
 const id=verifyPlanSigningToken(String(body.token||''),linkKey());
 if(!id)return publicReply({error:'El enlace no es válido o ya venció. Pide a Ámbar Couture uno nuevo.'},404);
 try{
  const db=publicServerClient();
  const {data:p,error}=await db.from('planes_ahorro').select('id,numero,estado,titular_nombre,titular_documento,telefono,email,quinceanera_nombre,fecha_evento,cuota_mensual,dia_pago,sede_id,firmado_at,contrato_texto,firma_base64,contrato_pdf_path,sedes(nombre,correo)').eq('id',id).maybeSingle();
  if(error)return publicReply({error:'El servicio no está disponible.'},503);
  if(!p)return publicReply({error:'Plan no encontrado.'},404);
  if(p.firmado_at)return publicReply({firmado:true,texto:p.contrato_texto,firma:p.firma_base64,firmado_at:p.firmado_at,nombre:p.titular_nombre});
  if(p.estado!=='activo')return publicReply({error:'Este plan ya no está activo.'},409);
  const plan:PlanFirma={id:p.id,numero:p.numero,sede:String((p.sedes as unknown as {nombre?:string}|null)?.nombre||''),sede_correo:(p.sedes as unknown as {correo?:string|null}|null)?.correo||null,titular_nombre:p.titular_nombre,telefono:p.telefono,email:p.email,
   quinceanera_nombre:p.quinceanera_nombre,fecha_evento:p.fecha_evento,cuota_mensual:Number(p.cuota_mensual),dia_pago:p.dia_pago};
  const raw=(body.datos||{}) as Record<string,unknown>;
  const datos:DatosFirmante={cedula:limpio(raw.cedula||p.titular_documento,30),direccion:limpio(raw.direccion,160),correo:limpio(raw.correo||p.email,254).toLowerCase(),quinceanera:limpio(raw.quinceanera||p.quinceanera_nombre,120),ti:limpio(raw.ti,30)};
  const now=new Date();
  if(body.accion!=='firmar')return publicReply({firmado:false,plan:{nombre:plan.titular_nombre,sede:plan.sede,numero:plan.numero},datos,texto:planContractText(plan,datos,now)});
  if(!/^\d{5,12}$/.test(datos.cedula.replace(/\D/g,'')))return publicReply({error:'Escribe tu número de cédula.'},400);
  if(datos.direccion.length<5)return publicReply({error:'Escribe tu dirección.'},400);
  if(datos.quinceanera.length<3)return publicReply({error:'Escribe el nombre de la quinceañera.'},400);
  if(datos.correo&&!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(datos.correo))return publicReply({error:'El correo no es válido.'},400);
  if(!validSignature(body.firma))return publicReply({error:'Dibuja tu firma en el recuadro.'},400);
  if(body.acepta!==true)return publicReply({error:'Debes aceptar el contrato para firmarlo.'},400);
  if(body.acepta_datos!==true||typeof body.comercial!=='boolean')return publicReply({error:'Marca la autorización de tratamiento de datos y elige si autorizas recibir promociones.'},400);
  const texto=planContractText(plan,datos,now),firma=String(body.firma);
  const hash=createHash('sha256').update(JSON.stringify(texto)).update(firma).digest('hex'),codigo=hash.slice(0,12).toUpperCase();
  const pdf=planContractPdf(texto,firma,`Firmado electrónicamente por ${plan.titular_nombre} (C.C. ${datos.cedula}) el ${now.toLocaleString('es-CO',{timeZone:'America/Bogota'})} · Versión ${PLAN_CONTRACT_VERSION} · Código de verificación ${codigo}`);
  const path=`${p.sede_id}/${p.id}/contrato-${codigo}.pdf`;
  const {error:up}=await db.storage.from('planes_ahorro').upload(path,pdf,{contentType:'application/pdf',upsert:true});
  // Signed only once: the update only applies while the plan is still unsigned.
  const {data:ok,error:e2}=await db.from('planes_ahorro').update({contrato_version:PLAN_CONTRACT_VERSION,contrato_texto:texto,firma_base64:firma,firmado_at:now.toISOString(),firma_hash:hash,
   firma_ip:(request.headers.get('x-forwarded-for')||'').split(',')[0].trim().slice(0,60)||null,firma_user_agent:(request.headers.get('user-agent')||'').slice(0,300)||null,
   contrato_pdf_path:up?null:path,firmante:datos,titular_documento:datos.cedula,email:datos.correo||null,quinceanera_nombre:datos.quinceanera,updated_at:now.toISOString()})
   .eq('id',p.id).is('firmado_at',null).select('id');
  if(e2)return publicReply({error:'No se pudo guardar la firma. Intenta nuevamente.'},503);
  if(!ok?.length)return publicReply({error:'Este contrato ya fue firmado.'},409);
  try{const {tratamiento}=await loadAuthTexts(db);
   await registerAuthorization(db,{documento:datos.cedula,telefono:plan.telefono,nombre:plan.titular_nombre,email:datos.correo||null,sede:p.sede_id,origen:'contrato',tratamiento:true,comercial:body.comercial===true,pendiente:false,versionTratamiento:tratamiento?String(tratamiento.version):null});
  }catch(e){console.error('Autorización de datos (Plan Ahorro XV) no registrada:',e);}
  return publicReply({firmado:true,texto,firma,firmado_at:now.toISOString(),nombre:plan.titular_nombre,codigo,pdf:up?null:Buffer.from(pdf).toString('base64')});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
