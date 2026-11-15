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

/** Anuncios fase 1 (read only): every ad account the token reaches, with campaigns and ad sets (status and budget) and, per ad,
 *  Meta's metrics for the period (spend, reach, impressions, clicks, CTR, CPM, conversations started, leads). */
type Account={id:string;name:string;currency:string;account_status:number};
export type PortfolioAd={cuenta:string;moneda:string;campana_id:string;campana:string;campana_estado:string;objetivo:string;conjunto_id:string;conjunto:string;conjunto_estado:string;
 presupuesto_diario:number|null;presupuesto_total:number|null;anuncio_id:string;anuncio:string;gasto:number;alcance:number;impresiones:number;clics:number;ctr:number;cpm:number;conversaciones:number;leads:number};
async function pages<T>(url:string,token:string,max=5){
 const out:T[]=[];let next:string|null=url;
 for(let i=0;next&&i<max;i++){
  const r:Response=await fetch(next,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
  const d=await r.json().catch(()=>({})) as {data?:T[];paging?:{next?:string};error?:{message?:string}};
  if(!r.ok)throw Error(String(d.error?.message||r.status));
  out.push(...(d.data||[]));next=d.paging?.next||null;
 }
 return out;
}
const action=(list:{action_type:string;value:string}[]|undefined,...types:string[])=>(list||[]).filter(a=>types.includes(a.action_type)).reduce((n,a)=>n+Number(a.value||0),0);
export async function adsPortfolio(desde:string,hasta:string){
 const token=process.env.META_ADS_TOKEN;if(!token)return {cuentas:[] as Account[],anuncios:[] as PortfolioAd[],errores:['Falta META_ADS_TOKEN']};
 const range=encodeURIComponent(JSON.stringify({since:desde,until:hasta})),errores:string[]=[];
 const cuentas=await pages<Account>(graph('me/adaccounts?fields=id,name,currency,account_status&limit=50'),token,2).catch(e=>{errores.push(`Cuentas: ${e.message}`);return [] as Account[];});
 const anuncios:PortfolioAd[]=[];
 for(const c of cuentas){
  try{
   const [camps,sets,ins]=await Promise.all([
    pages<{id:string;name:string;effective_status:string;objective:string;daily_budget?:string;lifetime_budget?:string}>(graph(`${c.id}/campaigns?fields=id,name,effective_status,objective,daily_budget,lifetime_budget&limit=200`),token),
    pages<{id:string;name:string;effective_status:string;daily_budget?:string;lifetime_budget?:string}>(graph(`${c.id}/adsets?fields=id,name,effective_status,daily_budget,lifetime_budget&limit=200`),token),
    pages<Record<string,unknown>>(graph(`${c.id}/insights?level=ad&time_range=${range}&fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,reach,impressions,clicks,ctr,cpm,actions&limit=500`),token),
   ]);
   const camp=new Map(camps.map(x=>[x.id,x])),set=new Map(sets.map(x=>[x.id,x]));
   // Meta returns budgets in cents of the account currency (COP has no decimals but still uses ×100).
   const plata=(v?:string)=>v?Number(v)/100:null;
   for(const r of ins){
    const k=camp.get(String(r.campaign_id)),s=set.get(String(r.adset_id)),acts=r.actions as {action_type:string;value:string}[]|undefined;
    anuncios.push({cuenta:c.name,moneda:c.currency,campana_id:String(r.campaign_id),campana:String(r.campaign_name||''),campana_estado:k?.effective_status||'—',objetivo:k?.objective||'—',
     conjunto_id:String(r.adset_id),conjunto:String(r.adset_name||''),conjunto_estado:s?.effective_status||'—',
     presupuesto_diario:plata(s?.daily_budget)??plata(k?.daily_budget),presupuesto_total:plata(s?.lifetime_budget)??plata(k?.lifetime_budget),
     anuncio_id:String(r.ad_id),anuncio:String(r.ad_name||''),gasto:Number(r.spend||0),alcance:Number(r.reach||0),impresiones:Number(r.impressions||0),clics:Number(r.clicks||0),
     ctr:Number(r.ctr||0),cpm:Number(r.cpm||0),conversaciones:action(acts,'onsite_conversion.messaging_conversation_started_7d'),leads:action(acts,'lead','onsite_conversion.lead_grouped')});
   }
   // Active campaigns without delivery in the period still show (budget and status), without metrics.
   for(const k of camps.filter(x=>x.effective_status==='ACTIVE'&&!ins.some(r=>String(r.campaign_id)===x.id)))
    anuncios.push({cuenta:c.name,moneda:c.currency,campana_id:k.id,campana:k.name,campana_estado:k.effective_status,objetivo:k.objective,conjunto_id:'',conjunto:'',conjunto_estado:'',
     presupuesto_diario:plata(k.daily_budget),presupuesto_total:plata(k.lifetime_budget),anuncio_id:'',anuncio:'(sin entrega en el periodo)',gasto:0,alcance:0,impresiones:0,clics:0,ctr:0,cpm:0,conversaciones:0,leads:0});
  }catch(e){errores.push(`${c.name}: ${e instanceof Error?e.message:'error'}`);}
 }
 return {cuentas,anuncios,errores};
}
