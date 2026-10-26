import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply,readJson,UUID_RE} from '@/lib/public-db';
import {measureErrors,type MeasureField} from '@/lib/ally-measures';
import {allyMeasuresEmail,allyMeasuresFixEmail,sendAllyEmail} from '@/lib/ally-emails';
export const dynamic='force-dynamic';

type Db=ReturnType<typeof publicServerClient>;
const origin=(request:Request)=>process.env.FIRST_VISIT_PUBLIC_ORIGIN?.replace(/\/$/,'')||new URL(request.url).origin;
const fecha=(d:string|null)=>d?d.split('-').reverse().join('/'):'';

async function load(db:Db,by:{token?:string;contrato?:string}){
 const q=db.from('contrato_medidas').select('contrato_id,token,valores,estado,nota_correccion,confirmado_at,contratos(numero_contrato,quinceanera_name,fecha_evento,categoria_aliado,aliado_id,aliado_datos,aliados(estado,nombre_completo,correo))');
 const {data}=await (by.token?q.eq('token',by.token):q.eq('contrato_id',by.contrato!)).maybeSingle();
 return data as null|{contrato_id:string;token:string;valores:Record<string,unknown>;estado:string;nota_correccion:string|null;confirmado_at:string|null;
  contratos:{numero_contrato:string;quinceanera_name:string|null;fecha_evento:string|null;categoria_aliado:string|null;aliado_id:string;aliados:{estado:string;nombre_completo:string;correo:string}|null}};
}
const fields=async(db:Db)=>{
 const {data}=await db.from('medidas_campos').select('*').eq('activo',true).order('orden').order('id');
 return Promise.all(((data||[]) as MeasureField[]).map(async f=>({...f,imagen_url:f.imagen_path?(await db.storage.from('aliados_documentos').createSignedUrl(f.imagen_path,3600)).data?.signedUrl||null:null})));
};
const linkOf=(request:Request,token:string)=>`${origin(request)}/aliados/medidas#${token}`;

/** Ally (token, public): view and send measures. Team (session): create and send the link, review, request correction, approve, edit. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let body:Record<string,unknown>;
 try{body=await readJson(request,50_000);}catch{return publicReply({error:'Datos no válidos.'},400);}
 try{
  const db=publicServerClient(),accion=String(body.accion||'');
  if(accion==='ver'||accion==='enviar'){
   const token=String(body.token||'');
   if(!UUID_RE.test(token))return publicReply({error:'El enlace no es válido.'},404);
   const m=await load(db,{token});
   if(!m||m.contratos.aliados?.estado!=='activo')return publicReply({error:'El enlace no es válido o el aliado no está activo.'},404);
   const campos=await fields(db),c=m.contratos;
   const info={clienta:c.quinceanera_name||'',categoria:c.categoria_aliado||'',fecha_evento:c.fecha_evento,contrato:c.numero_contrato,estado:m.estado,nota:m.nota_correccion,valores:m.valores,campos};
   if(accion==='ver')return publicReply(info);
   if(!['Pendiente','Corrección solicitada'].includes(m.estado))return publicReply({error:'Las medidas ya fueron enviadas. Si necesitas cambiarlas, comunícate con Ámbar Couture.'},409);
   if(body.confirma!==true)return publicReply({error:'Marca la casilla de confirmación de medidas.'},400);
   const valores=Object.fromEntries(campos.map(f=>[f.nombre,String((body.valores as Record<string,unknown>|undefined)?.[f.nombre]??'').replace(',','.').trim()]));
   const errs=measureErrors(campos,valores);
   if(!campos.length)return publicReply({error:'Ámbar Couture aún no configuró la ficha de medidas.'},409);
   if(errs.length)return publicReply({error:errs[0]},400);
   const now=new Date().toISOString();
   await db.from('contrato_medidas').update({valores,estado:'Enviadas',confirmado_at:now,enviado_at:now,actualizado_en:now}).eq('contrato_id',m.contrato_id);
   return publicReply({ok:true});
  }
  // Team actions: the user's session decides access (RLS / permission inside revisar_medidas).
  const bearer=request.headers.get('authorization')||'';
  if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const contrato=String(body.contrato_id||'');
  if(!UUID_RE.test(contrato))return publicReply({error:'Contrato no válido.'},400);
  const {data:visible}=await userDb.from('contratos').select('id,tiene_aliado').eq('id',contrato).maybeSingle();
  if(!visible?.tiene_aliado)return publicReply({error:'Contrato no encontrado o no es de modo Aliado.'},404);
  if(accion==='crear'||accion==='reenviar'){
   await db.from('contrato_medidas').insert({contrato_id:contrato}).select().maybeSingle();
   const m=await load(db,{contrato});
   if(!m)return publicReply({error:'No se pudo crear la ficha de medidas.'},503);
   const c=m.contratos,ok=await sendAllyEmail(c.aliados?.correo||'',allyMeasuresEmail(c.aliados?.nombre_completo||'',c.quinceanera_name||'',c.categoria_aliado||'',fecha(c.fecha_evento),linkOf(request,m.token)));
   return publicReply({ok,link:linkOf(request,m.token)});
  }
  if(accion==='revisar'){
   const {error}=await userDb.rpc('revisar_medidas',{p_contrato:contrato,p_estado:body.estado||null,p_nota:body.nota||null,p_valores:body.valores||null});
   if(error)return publicReply({error:error.message},400);
   if(body.estado==='Corrección solicitada'){
    const m=await load(db,{contrato});
    if(m)await sendAllyEmail(m.contratos.aliados?.correo||'',allyMeasuresFixEmail(m.contratos.aliados?.nombre_completo||'',m.contratos.quinceanera_name||'',String(body.nota||''),linkOf(request,m.token)));
   }
   return publicReply({ok:true});
  }
  return publicReply({error:'Acción no válida.'},400);
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
