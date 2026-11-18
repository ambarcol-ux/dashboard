import type {SupabaseClient} from '@supabase/supabase-js';
import {aiClient} from './ai-usage';
import {adsPortfolio,adsTokenReady,type PortfolioAd} from './meta-ads';

/** Marketing › Anuncios: daily report of the Meta ads. Last 7 days against the 7 before, per ad: Meta's spend and metrics plus what each
 *  ad brought to the ERP (chats → first visits → attended → contracts). Fixed alerts and an AI report with concrete recommendations.
 *  It only recommends: nothing changes in Meta without administration. */
const MODEL='claude-sonnet-5-5';
const DAY=86400000;
type Embudo={anuncio_id:string;nombre:string|null;campana:string|null;sede:string|null;chats:number;citas:number;asistieron:number;contratos:number};
export type AdFila={id:string;anuncio:string;campana:string;sede:string|null;estado:string;presupuesto_diario:number|null;gasto:number;conversaciones:number;ctr:number;cpm:number;
 chats:number;citas:number;asistieron:number;contratos:number;costo_cita:number|null;costo_contrato:number|null;
 antes:{gasto:number;citas:number;ctr:number;costo_cita:number|null}|null};
export type Alerta={tipo:'gasto_sin_citas'|'costo_cita_sube'|'cansancio'|'chats_sin_citas'|'sin_entrega';anuncio:string;sede:string|null;detalle:string};
export type Recomendacion={accion:'subir'|'bajar'|'apagar'|'duplicar'|'renovar'|'revisar_chat'|'otra';anuncio:string;detalle:string};

const SYSTEM=`Eres la analista de publicidad de Ámbar Couture (alquiler de vestidos de XV años, gala, novia y pajecitas en Colombia; sedes Bogotá, Pereira, Villavicencio y Barranquilla).
Cada mañana revisas los anuncios de Meta de los últimos 7 días comparados con los 7 anteriores. Lo que importa son las primeras citas, las asistencias y los contratos que trae cada anuncio al ERP, no solo los chats o los clics.
Recibes por anuncio: sede, estado, presupuesto diario, gasto, conversaciones en Meta, CTR, CPM, chats que llegaron al ERP, citas, asistencias, contratos, costo por cita y por contrato, y las cifras de la semana anterior. También las alertas automáticas.
Escribe en "resumen" un informe breve en español claro para la dueña (sin tecnicismos, máximo 10 líneas): cómo fue la semana frente a la anterior (gasto, citas, costo por cita, contratos), qué anuncios y sedes funcionan mejor y cuáles gastan sin traer citas, y qué haría hoy.
En "recomendaciones" da como máximo 5 acciones concretas, cada una sobre un anuncio con su nombre exacto: subir presupuesto (con cuánto), bajar, apagar, duplicar para otra sede, renovar el diseño o revisar cómo se atienden sus chats. No juzgues un anuncio solo por sus chats: muchas personas ven el anuncio y agendan después por el perfil de Instagram o la página de citas, y esas citas no se le acreditan (vienen en «citas_por_canal»). Recomienda apagar solo si gasta sin traer chats ni citas, o si lleva más de una semana sin resultados; si trae muchos chats y pocas citas, lo primero es revisar cómo se atienden esos chats. Usa solo las cifras recibidas: no inventes datos. Con pocos datos (menos de 3 citas o menos de $30.000 de gasto) dilo y sé prudente. Recuerda que un anuncio nuevo necesita unos días para aprender.`;
const SCHEMA={type:'object',additionalProperties:false,required:['resumen','recomendaciones'],properties:{
 resumen:{type:'string'},
 recomendaciones:{type:'array',items:{type:'object',additionalProperties:false,required:['accion','anuncio','detalle'],properties:{
  accion:{type:'string',enum:['subir','bajar','apagar','duplicar','renovar','revisar_chat','otra']},anuncio:{type:'string'},detalle:{type:'string'}}}},
}};
const bogota=(t:number)=>new Date(t-5*3600000).toISOString().slice(0,10);
const cop=(n:number)=>`$${Math.round(n).toLocaleString('es-CO')}`;

async function periodo(db:SupabaseClient,desde:string,hasta:string){
 const [{anuncios,errores},{data:erp,error}]=await Promise.all([adsPortfolio(desde,hasta),db.rpc('anuncios_embudo_servidor',{p_desde:desde,p_hasta:hasta})]);
 if(error)throw Error(error.message);
 return {anuncios:anuncios as PortfolioAd[],errores,erp:new Map(((erp||[]) as Embudo[]).map(r=>[r.anuncio_id,r]))};
}

/** Builds today's report, saves it in anuncios_ia_informes and returns it. */
export async function dailyAdsAnalysis(db:SupabaseClient,now=Date.now()){
 const hasta=bogota(now-DAY),desde=bogota(now-7*DAY),antesHasta=bogota(now-8*DAY),antesDesde=bogota(now-14*DAY);
 const {data:ps}=await db.from('config_parametros').select('clave,valor').in('clave',['anuncios_alerta_sin_citas']);
 const umbral=Number(ps?.find(p=>p.clave==='anuncios_alerta_sin_citas')?.valor)||50000;
 const [act,ant]=await Promise.all([periodo(db,desde,hasta),periodo(db,antesDesde,antesHasta)]);
 const antes=new Map(ant.anuncios.map(a=>[a.anuncio_id,a]));
 const filas:AdFila[]=act.anuncios.filter(a=>a.gasto>0||act.erp.has(a.anuncio_id)).map(a=>{
  const e=act.erp.get(a.anuncio_id),p=antes.get(a.anuncio_id),pe=ant.erp.get(a.anuncio_id);
  const citas=Number(e?.citas||0),contratos=Number(e?.contratos||0),pc=Number(pe?.citas||0);
  return {id:a.anuncio_id,anuncio:a.anuncio,campana:a.campana,sede:e?.sede||null,estado:a.conjunto_estado||a.campana_estado,presupuesto_diario:a.presupuesto_diario,gasto:a.gasto,
   conversaciones:a.conversaciones+a.leads,ctr:a.ctr,cpm:a.cpm,chats:Number(e?.chats||0),citas,asistieron:Number(e?.asistieron||0),contratos,
   costo_cita:citas?a.gasto/citas:null,costo_contrato:contratos?a.gasto/contratos:null,
   antes:p?{gasto:p.gasto,citas:pc,ctr:p.ctr,costo_cita:pc?p.gasto/pc:null}:null};
 }).sort((a,b)=>b.gasto-a.gasto);
 // Fixed alerts (no AI): they always show, even if the AI does not answer.
 const alertas:Alerta[]=[];
 for(const f of filas){
  if(f.gasto>=umbral&&!f.citas)alertas.push({tipo:'gasto_sin_citas',anuncio:f.anuncio,sede:f.sede,detalle:`Gastó ${cop(f.gasto)} en 7 días sin traer ninguna primera cita.`});
  if(f.costo_cita&&f.antes?.costo_cita&&f.antes.citas>=3&&f.costo_cita>f.antes.costo_cita*1.3)
   alertas.push({tipo:'costo_cita_sube',anuncio:f.anuncio,sede:f.sede,detalle:`El costo por cita subió de ${cop(f.antes.costo_cita)} a ${cop(f.costo_cita)} (${Math.round(100*(f.costo_cita/f.antes.costo_cita-1))} %).`});
  if(f.antes&&f.antes.ctr>0&&f.gasto>=20000&&f.ctr<f.antes.ctr*0.7)
   alertas.push({tipo:'cansancio',anuncio:f.anuncio,sede:f.sede,detalle:`Cada vez menos gente le da clic (de ${f.antes.ctr.toFixed(1)} % a ${f.ctr.toFixed(1)} %): el público se está cansando del diseño, conviene renovarlo.`});
  if(f.chats>=10&&f.citas/f.chats<0.05)alertas.push({tipo:'chats_sin_citas',anuncio:f.anuncio,sede:f.sede,detalle:`Trajo ${f.chats} chats pero solo ${f.citas} cita${f.citas===1?'':'s'}: revisa el mensaje del anuncio o cómo se atienden esos chats.`});
  if(f.estado==='WITH_ISSUES'||f.estado==='DISAPPROVED')alertas.push({tipo:'sin_entrega',anuncio:f.anuncio,sede:f.sede,detalle:'Meta lo marca con problemas o rechazado: revísalo en el Administrador de anuncios.'});
 }
 const suma=(l:AdFila[],k:'gasto'|'citas'|'contratos'|'chats'|'asistieron')=>l.reduce((n,f)=>n+Number(f[k]||0),0);
 const antTot={gasto:ant.anuncios.reduce((n,a)=>n+a.gasto,0),citas:[...ant.erp.values()].reduce((n,r)=>n+Number(r.citas||0),0),contratos:[...ant.erp.values()].reduce((n,r)=>n+Number(r.contratos||0),0)};
 const metricas={desde,hasta,gasto:suma(filas,'gasto'),chats:suma(filas,'chats'),citas:suma(filas,'citas'),asistieron:suma(filas,'asistieron'),contratos:suma(filas,'contratos'),
  anterior:antTot,errores:[...act.errores,...ant.errores].slice(0,5),token:adsTokenReady()} as Record<string,unknown>&{gasto:number;chats:number;citas:number;asistieron:number;contratos:number};
 // Visits of the period by the way they booked (Instagram profile, booking page, WhatsApp…) and store: context for the ads.
 const {data:citasCanal}=await db.from('primeras_citas').select('origen_enlace,anuncio_id,sede_id').gte('created_at',`${desde}T05:00:00Z`).lt('created_at',new Date(Date.parse(`${hasta}T05:00:00Z`)+DAY).toISOString()).neq('estado','cancelada').limit(3000);
 const {data:sedesData}=await db.from('sedes').select('id,nombre');const sedeNom=new Map(((sedesData||[]) as {id:string;nombre:string}[]).map(s=>[s.id,s.nombre]));
 const CANAL:Record<string,string>={'ig-perfil':'perfil de Instagram','whatsapp-chat':'chat de WhatsApp','ia-whatsapp':'IA de WhatsApp'};
 const citas_por_canal:Record<string,number>={};
 for(const c of (citasCanal||[]) as {origen_enlace:string|null;anuncio_id:string|null;sede_id:string|null}[]){const k=`${sedeNom.get(String(c.sede_id))||'Sin sede'} · ${c.anuncio_id?'desde un anuncio':CANAL[String(c.origen_enlace)]||'página de citas u otro'}`;citas_por_canal[k]=(citas_por_canal[k]||0)+1;}
 Object.assign(metricas,{citas_por_canal,citas_totales:(citasCanal||[]).length});
 let resumen=filas.length?'':'No hubo anuncios con gasto ni chats en los últimos 7 días.',recomendaciones:Recomendacion[]=[];
 if(filas.length&&process.env.ANTHROPIC_API_KEY){
  try{
   const client=aiClient('informe_anuncios',{timeout:50000,maxRetries:0});
   const r=await client.messages.create({model:MODEL,max_tokens:3000,system:SYSTEM,output_config:{effort:'low',format:{type:'json_schema',schema:SCHEMA}},
    messages:[{role:'user',content:`<totales>\n${JSON.stringify(metricas)}\n</totales>\n<alertas>\n${JSON.stringify(alertas)}\n</alertas>\n<anuncios>\n${JSON.stringify(filas.slice(0,60))}\n</anuncios>`}]});
   const t=r.content.find(b=>b.type==='text');
   if(t&&t.type==='text'){const out=JSON.parse(t.text) as {resumen:string;recomendaciones:Recomendacion[]};resumen=out.resumen;recomendaciones=(out.recomendaciones||[]).slice(0,5);}
  }catch(e){resumen=`No se pudo generar el análisis con IA (${e instanceof Error?e.message.slice(0,120):'error'}). Las cifras y alertas de abajo sí están al día.`;}
 }
 const {data:row,error}=await db.from('anuncios_ia_informes').insert({desde,hasta,metricas,alertas,filas,resumen,recomendaciones}).select('id').single();
 if(error)throw Error(error.message);
 return {id:row.id,alertas:alertas.length,recomendaciones:recomendaciones.length};
}
