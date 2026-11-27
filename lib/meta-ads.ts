import type {SupabaseClient} from '@supabase/supabase-js';

/** Medición de anuncios: names and spend of Meta ads, read with META_ADS_TOKEN (system user token with ads_read). */
const graph=(path:string)=>`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v21.0'}/${path}`;
const norm=(v:string)=>v.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
export const adsTokenReady=()=>!!process.env.META_ADS_TOKEN;
/** Meta budgets are integers in the currency's minor unit: ×100 for most, ×1 for currencies without cents (COP included). */
const SIN_CENTAVOS=new Set(['CLP','COP','CRC','HUF','ISK','IDR','JPY','KRW','PYG','TWD','VND']);
export const metaOffset=(moneda?:string|null)=>SIN_CENTAVOS.has(String(moneda||'COP').toUpperCase())?1:100;

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
export type PortfolioAd={cuenta:string;moneda:string;campana_id:string;campana:string;campana_estado:string;objetivo:string;conjunto_id:string;conjunto:string;conjunto_estado:string;presupuesto_en:'conjunto'|'campana';
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
   // Meta returns budgets in the minor unit of the account currency (COP: pesos, ×1).
   const plata=(v?:string)=>v?Number(v)/metaOffset(c.currency):null;
   for(const r of ins){
    const k=camp.get(String(r.campaign_id)),s=set.get(String(r.adset_id)),acts=r.actions as {action_type:string;value:string}[]|undefined;
    anuncios.push({cuenta:c.name,moneda:c.currency,campana_id:String(r.campaign_id),campana:String(r.campaign_name||''),campana_estado:k?.effective_status||'—',objetivo:k?.objective||'—',
     conjunto_id:String(r.adset_id),conjunto:String(r.adset_name||''),conjunto_estado:s?.effective_status||'—',presupuesto_en:s?.daily_budget||s?.lifetime_budget?'conjunto':'campana',
     presupuesto_diario:plata(s?.daily_budget)??plata(k?.daily_budget),presupuesto_total:plata(s?.lifetime_budget)??plata(k?.lifetime_budget),
     anuncio_id:String(r.ad_id),anuncio:String(r.ad_name||''),gasto:Number(r.spend||0),alcance:Number(r.reach||0),impresiones:Number(r.impressions||0),clics:Number(r.clicks||0),
     ctr:Number(r.ctr||0),cpm:Number(r.cpm||0),conversaciones:action(acts,'onsite_conversion.messaging_conversation_started_7d'),leads:action(acts,'lead','onsite_conversion.lead_grouped')});
   }
   // Active campaigns without delivery in the period still show (budget and status), without metrics.
   for(const k of camps.filter(x=>x.effective_status==='ACTIVE'&&!ins.some(r=>String(r.campaign_id)===x.id)))
    anuncios.push({cuenta:c.name,moneda:c.currency,campana_id:k.id,campana:k.name,campana_estado:k.effective_status,objetivo:k.objective,conjunto_id:'',conjunto:'',conjunto_estado:'',presupuesto_en:'campana',
     presupuesto_diario:plata(k.daily_budget),presupuesto_total:plata(k.lifetime_budget),anuncio_id:'',anuncio:'(sin entrega en el periodo)',gasto:0,alcance:0,impresiones:0,clics:0,ctr:0,cpm:0,conversaciones:0,leads:0});
  }catch(e){errores.push(`${c.name}: ${e instanceof Error?e.message:'error'}`);}
 }
 return {cuentas,anuncios,errores};
}

/** Anuncios fase 2: pause, activate or change the daily budget of a campaign or ad set. The current values are read from Meta first
 *  (never trusted from the browser) so the caps apply to the real budget. Budgets go to Meta in the currency's minor unit (COP ×1). */
export type AdChange={id:string;tipo:'pausar'|'activar'|'presupuesto';valor?:number;tope:number;maxPct:number};
export async function adsChange({id,tipo,valor,tope,maxPct}:AdChange){
 const token=process.env.META_ADS_TOKEN;if(!token)throw Error('Falta META_ADS_TOKEN');
 if(!/^\d{5,25}$/.test(id))throw Error('Identificador inválido.');
 const r=await fetch(`${graph(id)}?fields=name,status,daily_budget,lifetime_budget,account_id`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
 const d=await r.json().catch(()=>({})) as {name?:string;status?:string;daily_budget?:string;lifetime_budget?:string;account_id?:string;error?:{message?:string}};
 if(!r.ok)throw Error(d.error?.message||'Meta no respondió.');
 const cuenta=d.account_id?await fetch(`${graph(`act_${d.account_id}`)}?fields=currency`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}).then(x=>x.json()).catch(()=>({})) as {currency?:string}:{};
 const off=metaOffset(cuenta.currency);
 const antes={nombre:d.name||'',estado:d.status||'',presupuesto_diario:d.daily_budget?Number(d.daily_budget)/off:null};
 const params=new URLSearchParams();
 if(tipo==='pausar')params.set('status','PAUSED');
 else if(tipo==='activar')params.set('status','ACTIVE');
 else{
  if(!d.daily_budget)throw Error(d.lifetime_budget?'Tiene presupuesto total, no diario: ajústalo en Meta.':'El presupuesto no está en este nivel (está en la campaña o en el conjunto).');
  const v=Math.round(Number(valor));
  if(!Number.isFinite(v)||v<=0)throw Error('Escribe un presupuesto válido.');
  if(v>tope)throw Error(`Supera el tope diario de $${tope.toLocaleString('es-CO')}. Puedes cambiarlo en Configuración.`);
  const act=antes.presupuesto_diario||0;
  if(act&&Math.abs(v-act)/act*100>maxPct+0.001)throw Error(`El cambio supera el ${maxPct}% permitido por ajuste (entre $${Math.ceil(act*(1-maxPct/100)).toLocaleString('es-CO')} y $${Math.floor(act*(1+maxPct/100)).toLocaleString('es-CO')}).`);
  params.set('daily_budget',String(v*off));
 }
 const w=await fetch(graph(id),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(15000)});
 const e=await w.json().catch(()=>({})) as {success?:boolean;error?:{message?:string;error_user_msg?:string}};
 if(!w.ok||e.success===false)throw Error(e.error?.error_user_msg||e.error?.message||'Meta rechazó el cambio.');
 const despues={...antes,...(tipo==='presupuesto'?{presupuesto_diario:Math.round(Number(valor))}:{estado:tipo==='pausar'?'PAUSED':'ACTIVE'})};
 return {antes,despues};
}

/** Anuncios fase 3: promotes a piece already published on Instagram (or Facebook) as a click-to-WhatsApp ad. Campaign, ad set and ad
 *  are created PAUSED: nothing spends until administration activates it in the portfolio (fase 2). Campaign budget (daily) and end date
 *  on the ad set. Audience: lookalike or renters (looked up by name in the account), or open, in the city of the piece's sede. */
export const PUBLICOS={similar:'Similar 1% | ERP Alquiló 180D',clientas:'ERP | Alquiló | 180D',abierto:''} as const;
export type Promocion={nombre:string;ciudad:string|null;ciudades?:string[];radio?:number;edadMin?:number;edadMax?:number;audienciaId?:string;presupuesto:number;dias:number;publico:keyof typeof PUBLICOS;pageId:string;igId?:string;igMediaId?:string;fbPostId?:string;tope:number};
/** Saved audiences of the ad account (for the «Público» list when promoting). */
export async function adsAudiences(){
 const token=process.env.META_ADS_TOKEN;if(!token)throw Error('Falta META_ADS_TOKEN');
 const r=await fetch(graph(`act_${process.env.META_AD_ACCOUNT_ID||'298134381906490'}/customaudiences?fields=id,name&limit=200`),{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {data?:{id:string;name:string}[];error?:{message?:string}};
 if(!r.ok)throw Error(d.error?.message||'Meta no respondió.');
 return (d.data||[]).map(a=>({id:a.id,nombre:a.name})).sort((a,b)=>a.nombre.localeCompare(b.nombre));
}
export async function adsPromote(p:Promocion){
 const token=process.env.META_ADS_TOKEN;if(!token)throw Error('Falta META_ADS_TOKEN');
 const act=`act_${process.env.META_AD_ACCOUNT_ID||'298134381906490'}`;
 if(!(p.presupuesto>0)||p.presupuesto>p.tope)throw Error(`El presupuesto diario debe estar entre $1 y el tope de $${p.tope.toLocaleString('es-CO')} (Configuración).`);
 if(!(p.dias>=1&&p.dias<=30))throw Error('La duración va de 1 a 30 días.');
 if(!p.igMediaId&&!p.fbPostId)throw Error('La pieza no tiene publicación en Instagram ni en Facebook.');
 const call=async(path:string,params?:Record<string,unknown>,method='POST')=>{
  const body=params?new URLSearchParams(Object.entries(params).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)])):undefined;
  const r=await fetch(graph(path),{method:params?method:'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body,signal:AbortSignal.timeout(20000)});
  const d=await r.json().catch(()=>({})) as Record<string,unknown>&{error?:{message?:string;error_user_msg?:string}};
  if(!r.ok||d.error)throw Error(d.error?.error_user_msg||d.error?.message||`Meta respondió ${r.status}`);
  return d;
 };
 // Location: one or several store cities (radius around each), or all Colombia when none is given.
 const geo:Record<string,unknown>={countries:['CO']},radio=[10,20,40,80].includes(Number(p.radio))?Number(p.radio):40;
 const ciudades=[...new Set((p.ciudades?.length?p.ciudades:p.ciudad?[p.ciudad]:[]).filter(Boolean))];
 const cities:{key:string;radius:number;distance_unit:string}[]=[];
 for(const c of ciudades){
  const g=await call(`search?type=adgeolocation&location_types=${encodeURIComponent('["city"]')}&country_code=CO&q=${encodeURIComponent(c)}`) as {data?:{key:string}[]};
  const key=g.data?.[0]?.key;if(!key)throw Error(`Meta no encontró la ciudad «${c}».`);cities.push({key,radius:radio,distance_unit:'kilometer'});
 }
 if(cities.length){delete geo.countries;geo.cities=cities;}
 const edadMin=Math.min(65,Math.max(18,Math.round(Number(p.edadMin)||18))),edadMax=Math.min(65,Math.max(edadMin,Math.round(Number(p.edadMax)||55)));
 const targeting:Record<string,unknown>={geo_locations:geo,age_min:edadMin,age_max:edadMax,genders:[2],targeting_automation:{advantage_audience:0}};
 if(p.audienciaId&&/^\d+$/.test(p.audienciaId))targeting.custom_audiences=[{id:p.audienciaId}];
 else if(PUBLICOS[p.publico]){
  const a=await call(`${act}/customaudiences?fields=id,name&limit=200`) as {data?:{id:string;name:string}[]};
  const aud=a.data?.find(x=>x.name===PUBLICOS[p.publico]);if(!aud)throw Error(`No encontré el público «${PUBLICOS[p.publico]}» en la cuenta de anuncios.`);
  targeting.custom_audiences=[{id:aud.id}];
 }
 const nombre=p.nombre.slice(0,90),fin=new Date(Date.now()+p.dias*86400000).toISOString();
 const {currency}=await call(`${act}?fields=currency`) as {currency?:string};
 const camp=String((await call(`${act}/campaigns`,{name:nombre,objective:'OUTCOME_ENGAGEMENT',status:'PAUSED',special_ad_categories:[],daily_budget:String(Math.round(p.presupuesto)*metaOffset(currency)),bid_strategy:'LOWEST_COST_WITHOUT_CAP'})).id);
 try{
  const set=String((await call(`${act}/adsets`,{name:nombre,campaign_id:camp,status:'PAUSED',billing_event:'IMPRESSIONS',optimization_goal:'CONVERSATIONS',destination_type:'WHATSAPP',
   promoted_object:{page_id:p.pageId},targeting,end_time:fin})).id);
  const cta={type:'WHATSAPP_MESSAGE',value:{app_destination:'WHATSAPP'}};
  const creative=p.igMediaId&&p.igId?{name:nombre,object_id:p.pageId,instagram_user_id:p.igId,source_instagram_media_id:p.igMediaId,call_to_action:cta}:{name:nombre,object_story_id:p.fbPostId,call_to_action:cta};
  const cr=String((await call(`${act}/adcreatives`,creative)).id);
  const ad=String((await call(`${act}/ads`,{name:nombre,adset_id:set,creative:{creative_id:cr},status:'PAUSED'})).id);
  return {campana_id:camp,conjunto_id:set,anuncio_id:ad};
 }catch(e){
  // Nothing half-built stays in the account: the paused campaign just created (never delivered) is removed.
  await fetch(graph(camp),{method:'DELETE',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}).catch(()=>null);
  throw e;
 }
}
