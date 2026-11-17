import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
import {planSigningToken} from '@/lib/plan-ahorro-contrato';
export const dynamic='force-dynamic';

const linkKey=()=>process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'';

/** Ventas › Plan Ahorro XV (staff): «enlace» returns the private signing link of a plan; «pdf» a 10-minute link to its signed PDF.
 *  Only plans the user can see (RLS: administration or whoever operates that store's cash register). */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 const body=await request.json().catch(()=>({})) as {plan_id?:string;accion?:string};
 if(!UUID_RE.test(String(body.plan_id||'')))return publicReply({error:'Plan no válido.'},400);
 const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:plan}=await userDb.from('planes_ahorro').select('id,estado,firmado_at,contrato_pdf_path').eq('id',body.plan_id!).maybeSingle();
 if(!plan)return publicReply({error:'No tienes acceso a este plan.'},403);
 if(body.accion==='pdf'){
  if(!plan.contrato_pdf_path)return publicReply({error:'El contrato aún no está firmado.'},404);
  const {data,error}=await publicServerClient().storage.from('planes_ahorro').createSignedUrl(plan.contrato_pdf_path,600);
  return error||!data?publicReply({error:'No se pudo abrir el contrato.'},503):publicReply({url:data.signedUrl});
 }
 if(plan.firmado_at)return publicReply({error:'Este contrato ya está firmado.'},409);
 if(plan.estado!=='activo')return publicReply({error:'Este plan ya no está activo.'},409);
 const origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN?.replace(/\/$/,'')||new URL(request.url).origin;
 return publicReply({url:`${origin}/plan-ahorro-firma#${planSigningToken(plan.id,linkKey())}`});
}
