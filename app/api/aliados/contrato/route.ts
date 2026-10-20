import {publicServerClient,publicReply,readJson,validSignature} from '@/lib/public-db';
import {ALLY_CONTRACT_VERSION,CONFIG_FIELDS,allyContractText,allyProfile,missingConfig,verifyAllyContractToken,type AllyContractConfig} from '@/lib/ally-contract';
export const dynamic='force-dynamic';

const linkKey=()=>process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const ALLY_FIELDS='id,nombre_aliado,contacto_nombre,telefono,correo,cedula,direccion,ciudad,banco_nombre,tipo_cuenta,numero_cuenta,estado';

// Public signing page (/aliado-contrato): the private link decides which ally; the browser never reads the database.
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let body:Record<string,unknown>;
 try{body=await readJson(request,1_600_000);}catch{return publicReply({error:'Datos no válidos.'},400);}
 const link=verifyAllyContractToken(String(body.token||''),linkKey());
 if(!link)return publicReply({error:'El enlace no es válido o ya venció. Pide a Ámbar Couture uno nuevo.'},404);
 try{
  const db=publicServerClient();
  const [{data:ally,error:e1},{data:signed,error:e2},{data:config,error:e3}]=await Promise.all([
   db.from('referidores').select(ALLY_FIELDS).eq('id',link.id).maybeSingle(),
   db.from('aliados_contratos_firmados').select('texto,firma_base64,firmado_at,datos_aliado').eq('referidor_id',link.id).maybeSingle(),
   db.from('aliados_contrato_config').select('*').eq('id',1).maybeSingle(),
  ]);
  if(e1||e2||e3)return publicReply({error:'El servicio no está disponible.'},503);
  if(!ally)return publicReply({error:'Aliado no encontrado.'},404);
  if(signed)return publicReply({firmado:true,texto:signed.texto,firma:signed.firma_base64,firmado_at:signed.firmado_at,nombre:(signed.datos_aliado as {nombre?:string})?.nombre||ally.nombre_aliado});
  if(missingConfig(config).length)return publicReply({error:'El contrato aún no está listo para firmar. Ámbar Couture te avisará.'},409);
  if(body.accion!=='firmar')return publicReply({firmado:false,config:Object.fromEntries(CONFIG_FIELDS.map(([k])=>[k,(config as Record<string,unknown>)[k]])),aliado:{nombre:ally.nombre_aliado||'',representante:ally.contacto_nombre||'',celular:ally.telefono||'',correo:ally.correo||'',cedula:ally.cedula||'',direccion:ally.direccion||'',ciudad:ally.ciudad||'',banco:ally.banco_nombre||'',tipo_cuenta:ally.tipo_cuenta||'',numero_cuenta:ally.numero_cuenta||''}});
  let profile;
  try{profile=allyProfile((body.datos||{}) as Record<string,unknown>);}catch(e){return publicReply({error:e instanceof Error?e.message:'Revisa tus datos.'},400);}
  if(!validSignature(body.firma))return publicReply({error:'Dibuja tu firma en el recuadro.'},400);
  if(body.acepta!==true)return publicReply({error:'Debes aceptar el contrato para firmarlo.'},400);
  const now=new Date(),texto=allyContractText(config as AllyContractConfig,profile,now);
  const {error:insertError}=await db.from('aliados_contratos_firmados').insert({referidor_id:ally.id,version:ALLY_CONTRACT_VERSION,texto,datos_aliado:profile,firma_base64:body.firma,firmado_at:now.toISOString(),
   ip:(request.headers.get('x-forwarded-for')||'').split(',')[0].trim().slice(0,60)||null,user_agent:(request.headers.get('user-agent')||'').slice(0,300)||null});
  if(insertError)return insertError.code==='23505'?publicReply({error:'Este contrato ya fue firmado.'},409):publicReply({error:'No se pudo guardar la firma. Intenta nuevamente.'},503);
  // The signed data becomes the ally's profile in the ERP.
  await db.from('referidores').update({cedula:profile.cedula,direccion:profile.direccion,ciudad:profile.ciudad,telefono:profile.celular,banco_nombre:profile.banco,tipo_cuenta:profile.tipo_cuenta,numero_cuenta:profile.numero_cuenta,contacto_nombre:profile.representante||profile.nombre}).eq('id',ally.id);
  return publicReply({firmado:true,texto,firma:body.firma,firmado_at:now.toISOString(),nombre:profile.nombre});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
