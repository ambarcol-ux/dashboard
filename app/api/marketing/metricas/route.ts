import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {publicServerClient} from '@/lib/public-db';
import {loadSocialSettings,pageToken} from '@/lib/social-inbox';
export const dynamic='force-dynamic';
export const maxDuration=60;

type Res=Record<string,unknown>;
const version=()=>process.env.META_GRAPH_VERSION||'v21.0';
async function get(path:string,token:string){
 const r=await fetch(`https://graph.facebook.com/${version()}/${path}${path.includes('?')?'&':'?'}access_token=${encodeURIComponent(token)}`,{signal:AbortSignal.timeout(20000)});
 const d=await r.json().catch(()=>({})) as Res;if(!r.ok)throw Error(String((d.error as {message?:string})?.message||r.status));return d;
}
const valor=(d:Res,name:string)=>{const m=((d.data||[]) as {name:string;values?:{value:number}[];total_value?:{value:number}}[]).find(x=>x.name===name);return Number(m?.total_value?.value??m?.values?.[0]?.value??0);};

/** Supabase cron (6:40 a. m. Bogotá): reach and interactions of the pieces published in the last 30 days, from Instagram and Facebook.
 *  Needs instagram_manage_insights and read_insights in the page token (Integraciones › «Probar conexión» says if they are missing). */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=publicServerClient(),s=await loadSocialSettings(db);
 if(!s)return Response.json({activo:false});
 const tk=await pageToken(s);
 const {data}=await db.from('contenido_piezas').select('id,formato,resultado').eq('estado','publicada').gte('publicado_at',new Date(Date.now()-30*86400000).toISOString()).limit(60);
 let n=0;
 for(const p of (data||[]) as {id:string;formato:string;resultado:Record<string,{id?:string}>}[]){
  const met:Record<string,Record<string,number|string>>={};
  const ig=p.resultado?.instagram?.id,fb=p.resultado?.facebook?.id;
  if(ig)try{const d=await get(`${ig}/insights?metric=${p.formato==='historia'?'reach,replies,total_interactions':'reach,likes,comments,shares,saved,total_interactions'}`,tk);
   met.instagram={alcance:valor(d,'reach'),interacciones:valor(d,'total_interactions'),me_gusta:valor(d,'likes'),comentarios:valor(d,'comments')+valor(d,'replies'),compartidos:valor(d,'shares'),guardados:valor(d,'saved')};}
   catch(e){met.instagram={error:(e instanceof Error?e.message:'Error').slice(0,160)};}
  if(fb&&p.formato!=='historia')try{const d=await get(`${fb}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares,insights.metric(post_impressions_unique)`,tk) as Res&{reactions?:{summary?:{total_count?:number}};comments?:{summary?:{total_count?:number}};shares?:{count?:number};insights?:Res};
   met.facebook={alcance:d.insights?valor(d.insights,'post_impressions_unique'):0,reacciones:Number(d.reactions?.summary?.total_count||0),comentarios:Number(d.comments?.summary?.total_count||0),compartidos:Number(d.shares?.count||0)};}
   catch(e){met.facebook={error:(e instanceof Error?e.message:'Error').slice(0,160)};}
  if(Object.keys(met).length){await db.from('contenido_piezas').update({metricas:met,metricas_at:new Date().toISOString()}).eq('id',p.id);n++;}
 }
 return Response.json({piezas:n});
}
