import type {SupabaseClient} from '@supabase/supabase-js';

/** Medición de anuncios: names and spend of Meta ads, read with META_ADS_TOKEN (system user token with ads_read). */
const graph=(path:string)=>`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v21.0'}/${path}`;
const norm=(v:string)=>v.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
export const adsTokenReady=()=>!!process.env.META_ADS_TOKEN;

/** The store whose name appears in the ad name (e.g. «Pereira · XV noviembre» → Pereira). */
export function sedeFromAdName(name:string,sites:{id:string;nombre:string}[]){
 const n=norm(name);
 return sites.find(s=>s.nombre&&n.includes(norm(s.nombre)))?.id||null;
}

/** Saves (or refreshes after 7 days) the ad's name, campaign and store; returns its store. Without token only the id is kept. */
export async function resolveAd(db:SupabaseClient,adId:string){
 if(!/^\d+$/.test(adId))return null;
 const {data:known}=await db.from('meta_anuncios').select('nombre,sede_id,actualizado_at').eq('id',adId).maybeSingle();
 if(known?.nombre&&Date.now()-Date.parse(known.actualizado_at)<7*86400000)return known.sede_id as string|null;
 const token=process.env.META_ADS_TOKEN;
 if(!token){if(!known)await db.from('meta_anuncios').upsert({id:adId},{onConflict:'id'});return known?.sede_id||null;}
 const r=await fetch(`${graph(adId)}?fields=name,campaign{name},adset{name}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
 const d=await r.json().catch(()=>({})) as {name?:string;campaign?:{name?:string};adset?:{name?:string}};
 if(!r.ok||!d.name){if(!known)await db.from('meta_anuncios').upsert({id:adId},{onConflict:'id'});return known?.sede_id||null;}
 const {data:sites}=await db.from('sedes').select('id,nombre').eq('activo',true);
 // The store can be in the ad, ad set or campaign name.
 const sede=sedeFromAdName(d.name,sites||[])||sedeFromAdName(d.adset?.name||'',sites||[])||sedeFromAdName(d.campaign?.name||'',sites||[]);
 await db.from('meta_anuncios').upsert({id:adId,nombre:d.name,campana:d.campaign?.name||null,conjunto:d.adset?.name||null,sede_id:sede,actualizado_at:new Date().toISOString()},{onConflict:'id'});
 return sede;
}

/** Spend per ad between two dates (account currency). Ads Meta does not answer for are left out. */
export async function adsSpend(ids:string[],desde:string,hasta:string){
 const token=process.env.META_ADS_TOKEN,out:Record<string,number>={};
 if(!token)return out;
 const range=encodeURIComponent(JSON.stringify({since:desde,until:hasta}));
 await Promise.all(ids.filter(id=>/^\d+$/.test(id)).slice(0,100).map(async id=>{
  const r=await fetch(`${graph(id)}/insights?fields=spend&time_range=${range}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}).catch(()=>null);
  const d=await r?.json().catch(()=>({})) as {data?:{spend?:string}[]}|undefined;
  if(r?.ok)out[id]=(d?.data||[]).reduce((n,x)=>n+(Number(x.spend)||0),0);
 }));
 return out;
}
