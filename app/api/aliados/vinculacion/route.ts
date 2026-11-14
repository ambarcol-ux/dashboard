import {publicServerClient,publicReply,validSignature} from '@/lib/public-db';
import {allySignup} from '@/lib/direct-allies';
import {agreementText,finishAllySigning,loadAgreement} from '@/lib/ally-signing';
import {ALLY_CONTRACT_VERSION,DATA_AUTHORIZATION,type AllyProfile} from '@/lib/ally-contract-text';
import {loadAuthTexts,registerAuthorization} from '@/lib/data-authorization';
export const dynamic='force-dynamic';

const CERT_TYPES:Record<string,string>={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const sedesActivas=(db:ReturnType<typeof publicServerClient>)=>db.from('sedes').select('id,nombre').eq('activo',true).order('nombre');
const tiposActivos=(db:ReturnType<typeof publicServerClient>)=>db.from('tipos_aliado').select('id,nombre').eq('activo',true).not('prefijo','is',null).order('nombre');

/** Public sign-up link (/aliados/vincular): types, agreement (fields shown as placeholders) and data authorization. */
export async function GET(){
 try{
  const db=publicServerClient(),[{data:tipos,error},agreement,{data:sedes},textos]=await Promise.all([tiposActivos(db),loadAgreement(db),sedesActivas(db),loadAuthTexts(db)]);
  if(error)throw error;
  if(!agreement.ready)return publicReply({error:'La vinculación de aliados aún no está disponible. Intenta más tarde.'},409);
  return publicReply({tipos,sedes:sedes||[],acuerdo:agreement.acuerdo?.secciones||null,config:agreement.acuerdo?null:agreement.config,autorizacion:DATA_AUTHORIZATION,comercial:textos.comercial?.texto||null});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}

/** Form > data authorization > agreement signature > Pendiente > notice to administration. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 try{
  const form=await request.formData(),cert=form.get('certificacion'),firma=form.get('firma');
  let input:Record<string,unknown>;
  try{input=JSON.parse(String(form.get('datos')||'{}'));}catch{return publicReply({error:'Datos no válidos.'},400);}
  if(form.get('acepta_datos')!=='true')return publicReply({error:'Debes autorizar el tratamiento de tus datos personales.'},400);
  if(form.get('acepta')!=='true')return publicReply({error:'Debes aceptar el acuerdo de vinculación.'},400);
  if(!validSignature(firma))return publicReply({error:'Dibuja tu firma en el recuadro.'},400);
  if(!(cert instanceof File)||!CERT_TYPES[cert.type]||cert.size>10*1024*1024)return publicReply({error:'Adjunta la certificación bancaria (PDF, JPG, PNG o WebP de máximo 10 MB).'},400);
  const db=publicServerClient(),[{data:tipos},agreement,{data:sedes}]=await Promise.all([tiposActivos(db),loadAgreement(db),sedesActivas(db)]);
  if(!agreement.ready)return publicReply({error:'La vinculación de aliados aún no está disponible.'},409);
  let d;
  try{d=allySignup(input,(tipos||[]).map(t=>t.id),(sedes||[]).map(s=>s.id));}catch(e){return publicReply({error:e instanceof Error?e.message:'Revisa tus datos.'},400);}
  const {data:dup}=await db.from('aliados').select('id').eq('cedula',d.cedula).limit(1);
  if(dup?.length)return publicReply({error:'Esta cédula ya está registrada como aliado. Comunícate con Ámbar Couture.'},409);
  const {data:ally,error}=await db.from('aliados').insert({...d,estado:'pendiente_firma',origen:'enlace'}).select('id').single();
  if(error)return publicReply({error:error.code==='23505'?'Esta cédula ya está registrada como aliado.':'No se pudo guardar tu solicitud. Revisa tus datos.'},error.code==='23505'?409:400);
  const certPath=`${ally.id}/certificacion/${crypto.randomUUID()}.${CERT_TYPES[cert.type]}`;
  const {error:up}=await db.storage.from('aliados_documentos').upload(certPath,Buffer.from(await cert.arrayBuffer()),{contentType:cert.type});
  if(up)return publicReply({error:'No se pudo subir la certificación. Intenta nuevamente.'},503);
  // Where the ally came from: the link parameter (e.g. ia-whatsapp, anuncio) and the 304 chat with the same phone.
  const tel=d.celular.replace(/\D/g,'').slice(-10),{data:chat}=tel.length===10?await db.from('whatsapp_conversaciones').select('id').like('telefono',`%${tel}`).order('ultimo_at',{ascending:false}).limit(1).maybeSingle():{data:null};
  await db.from('aliados').update({certificacion_path:certPath,origen_detalle:String(form.get('origen')||'').replace(/[^\w-]/g,'').slice(0,120)||null,conversacion_id:chat?.id||null}).eq('id',ally.id);
  const tipo=(tipos||[]).find(t=>t.id===d.tipo_aliado_id)?.nombre||'',now=new Date();
  const profile:AllyProfile={nombre:d.nombre_completo,cedula:d.cedula,representante:'',celular:d.celular,correo:d.correo,direccion:d.direccion,ciudad:'Colombia',banco:d.banco,tipo_cuenta:d.tipo_cuenta,numero_cuenta:d.numero_cuenta};
  const texto=agreementText(agreement,{...profile,tipo},now,(sedes||[]).find(x=>String(x.id)===String(d.sede_principal))?.nombre);
  const r=await finishAllySigning(db,{id:ally.id,nombre:d.nombre_completo,cedula:d.cedula,correo:d.correo,tipo},texto,firma,agreement.acuerdo?`Word v${agreement.acuerdo.version}`:ALLY_CONTRACT_VERSION,profile,request,now);
  if('error' in r)return publicReply({error:r.error},r.status);
  // Data authorization of the person (once per person): processing accepted with the agreement text; commercial optional.
  try{await registerAuthorization(db,{documento:d.cedula,telefono:d.celular,nombre:d.nombre_completo,email:d.correo,sede:d.sede_principal?String(d.sede_principal):null,origen:'vinculacion_aliado',tratamiento:true,comercial:form.get('comercial')==='true',pendiente:false,aliado:ally.id,versionTratamiento:`aliado:${ALLY_CONTRACT_VERSION}`});}
  catch(e){console.error('Autorización de datos no registrada:',e);}
  return publicReply({ok:true,codigo:r.codigo});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
