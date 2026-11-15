import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';
import {aiClient} from './ai-usage';
import {isPublicCatalogDress} from './catalog-public';
import {mainPhoto} from './dress-photo-match';
import {documentsForAI} from './doc-ia';
import {promotionsForAI} from './whatsapp-ai';
import {pageToken,type SocialSettings} from './social-inbox';
import {publishTiktok} from './tiktok';

/** Marketing › Estudio de contenido: pieces (story, post, carousel, reel) made by the AI from the real inventory and the
 *  team's library, approved by administration and published by the ERP on Instagram and Facebook. WhatsApp statuses
 *  are left ready to download (Meta does not allow publishing them by API). */
export type Formato='historia'|'publicacion'|'carrusel'|'reel';
export type Red='instagram'|'facebook'|'tiktok'|'whatsapp';
export type Medio={url:string;tipo:'imagen'|'video';fuente:'vestido'|'biblioteca';ref:string;nota?:string};
export type Pieza={id:string;formato:Formato;redes:Red[];sede_id:string|null;texto:string|null;medios:Medio[];estado:string;resultado:Record<string,Record<string,string>>;error:string|null};

const MODEL='claude-haiku-5-5';
const version=()=>process.env.META_GRAPH_VERSION||'v21.0';
/** Instagram only accepts JPEG photos. */
const isJpeg=(u:string)=>/\.jpe?g(\?|$)/i.test(u);
const LIMITE:Record<Formato,[number,number]>={historia:[1,1],publicacion:[1,1],carrusel:[2,10],reel:[1,1]};

type Dress={id:string;codigo:string;talla:string|null;color:string|null;categoria:string|null;sede_actual_id:string|null;clasificacion_id:number|null;precio_sugerido:number|null;precio_venta:number|null;
 foto_frente:string|null;foto_espalda:string|null;foto_detalle:string|null;imagen_url:string|null;para_alquiler:boolean|null;estado:string|null};
type Lib={id:string;url:string;tipo:'imagen'|'video';titulo:string|null;etiquetas:string[];sede_id:string|null;tiene_clienta:boolean;autorizada:boolean};

const OUT={type:'object',additionalProperties:false,required:['idea','texto','vestidos','biblioteca'],properties:{
 idea:{type:'string',description:'En una frase, qué muestra la pieza y por qué funciona'},
 texto:{type:'string',description:'Texto de la publicación (caption) en español, con llamado a la acción y hashtags al final. Para historias: texto corto que acompaña.'},
 vestidos:{type:'array',items:{type:'string'},description:'Códigos de vestido del inventario a mostrar, en orden'},
 biblioteca:{type:'array',items:{type:'string'},description:'IDs de la biblioteca a usar, en orden'},
}};

/** Creates a piece from a free order («carrusel de 5 vestidos rojos talla M de Bogotá»). It stays waiting for approval. */
export async function createPiece(db:SupabaseClient,p:{orden:string;formato:Formato;redes:Red[];sede_id:string|null;programada_at:string|null;regla_id?:string;regla_fecha?:string;excluir?:string[];vestido_id?:string},userId:string|null){
 const [{data:dresses},{data:desc},{data:sites},{data:types},{data:lib},docs,promos]=await Promise.all([
  db.from('vestidos').select('id,codigo,talla,color,categoria,sede_actual_id,clasificacion_id,precio_sugerido,precio_venta,foto_frente,foto_espalda,foto_detalle,imagen_url,para_alquiler,estado').eq('archivado',false),
  db.from('vestidos_ia_fotos').select('vestido_id,descripcion'),
  db.from('sedes').select('id,nombre,whatsapp'),
  db.from('clasificaciones_vestido').select('id,nombre'),
  db.from('contenido_biblioteca').select('id,url,tipo,titulo,etiquetas,sede_id,tiene_clienta,autorizada').eq('archivado',false).order('created_at',{ascending:false}).limit(200),
  documentsForAI(db).catch(()=>''),
  promotionsForAI(db).catch(()=>''),
 ]);
 const sede=new Map(((sites||[]) as {id:string;nombre:string;whatsapp:string|null}[]).map(s=>[s.id,s])),tipo=new Map(((types||[]) as {id:number;nombre:string}[]).map(t=>[t.id,t.nombre]));
 const d=new Map(((desc||[]) as {vestido_id:string;descripcion:string}[]).map(r=>[r.vestido_id,r.descripcion]));
 // Instagram and TikTok take JPEG photos (TikTok also WEBP, but JPEG keeps one rule).
 const ig=p.redes.includes('instagram')||p.redes.includes('tiktok');
 // Rules avoid the dresses used in the last two weeks (variety); a «new dress» piece shows that dress.
 const fuera=new Set(p.excluir||[]);
 const list=((dresses||[]) as Dress[]).filter(x=>isPublicCatalogDress(x)&&mainPhoto(x)&&(!ig||isJpeg(mainPhoto(x)!))&&(p.vestido_id?x.id===p.vestido_id:(!p.sede_id||x.sede_actual_id===p.sede_id)&&!fuera.has(x.id)));
 // Customers' images only with their authorization.
 const libs=((lib||[]) as Lib[]).filter(x=>(!x.tiene_clienta||x.autorizada)&&(p.formato==='reel'?x.tipo==='video':p.formato==='historia'||x.tipo==='imagen')&&(!ig||x.tipo==='video'||isJpeg(x.url)));
 const peso=(n:number|null)=>n?`$${Number(n).toLocaleString('es-CO')}`:'—';
 const inv=list.map(x=>`${String(x.codigo).trim()} · ${sede.get(x.sede_actual_id||'')?.nombre||'—'} · ${tipo.get(x.clasificacion_id!)||'—'} · ${x.categoria||'—'} · talla ${x.talla||'—'} · ${x.color||'—'} · alquiler ${peso(x.precio_sugerido)}${Number(x.precio_venta)>0?` · venta ${peso(x.precio_venta)}`:''}${d.get(x.id)?` · ${d.get(x.id)}`:''}`).join('\n');
 const bib=libs.map(x=>`${x.id} · ${x.tipo} · ${x.titulo||'—'} · etiquetas: ${x.etiquetas.join(', ')||'—'} · sede ${sede.get(x.sede_id||'')?.nombre||'todas'}`).join('\n');
 const sedes=[...sede.values()].map(s=>`${s.nombre}${s.whatsapp?` · WhatsApp ${s.whatsapp}`:''}`).join('\n');
 const [min,max]=LIMITE[p.formato];
 // Short code of the piece: when a customer mentions it on WhatsApp, her chat (and later visit and contract) counts for this piece.
 const codigo='P'+Array.from(crypto.getRandomValues(new Uint8Array(5)),b=>'0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[b%34]).join('');
 const system=`Eres la creadora de contenido de Ámbar Couture (alquiler y venta de vestidos de XV años, gala, novia y pajecitas en Colombia). Arma UNA pieza para redes sociales siguiendo la orden.
Reglas:
- Usa solo vestidos del inventario y archivos de la biblioteca listados abajo (nunca inventes códigos ni IDs). Formato «${p.formato}»: entre ${min} y ${max} elementos en total${p.formato==='reel'?' (un video de la biblioteca)':''}.
- No menciones precios salvo que la orden lo pida. Si hay una promoción vigente que aplique, puedes mencionarla con sus condiciones exactas.
- Texto cálido, elegante y corto, en español de Colombia, con emojis moderados, llamado a la acción (agendar cita o escribir al WhatsApp de la sede) y 5 a 10 hashtags al final. Respeta el tono y las reglas de los documentos de la marca.
- Incluye de forma natural el código de la pieza, ${codigo}, en el llamado a la acción (por ejemplo «Escríbenos al WhatsApp con el código ${codigo}»).
- Si la orden no se puede cumplir con el material disponible, haz la pieza más cercana y explícalo en «idea».`;
 const r=await aiClient('contenido_crear').messages.create({model:MODEL,max_tokens:1500,system,output_config:{format:{type:'json_schema',schema:OUT}},
  messages:[{role:'user',content:`<documentos_marca>\n${docs.slice(0,15000)}\n</documentos_marca>\n<promociones>\n${promos||'Ninguna vigente'}\n</promociones>\n<sedes>\n${sedes}\n</sedes>\n<inventario>\n${inv||'Sin vestidos con foto para esta selección'}\n</inventario>\n<biblioteca>\n${bib||'Vacía'}\n</biblioteca>\n\nRedes: ${p.redes.join(', ')}. Sede: ${p.sede_id?sede.get(p.sede_id)?.nombre:'todas'}.\nOrden: ${p.orden}`}]});
 const block=r.content.find((b):b is Anthropic.TextBlock=>b.type==='text');
 const out=(block?JSON.parse(block.text):{idea:'',texto:'',vestidos:[],biblioteca:[]}) as {idea:string;texto:string;vestidos:string[];biblioteca:string[]};
 const byCode=new Map(list.map(x=>[String(x.codigo).trim(),x])),byLib=new Map(libs.map(x=>[x.id,x]));
 const medios:Medio[]=[
  ...out.biblioteca.map(id=>byLib.get(id)).filter((x):x is Lib=>!!x).map(x=>({url:x.url,tipo:x.tipo,fuente:'biblioteca' as const,ref:x.id,nota:x.titulo||undefined})),
  ...out.vestidos.map(c=>byCode.get(String(c).trim())).filter((x):x is Dress=>!!x).map(x=>({url:mainPhoto(x)!,tipo:'imagen' as const,fuente:'vestido' as const,ref:x.id,nota:String(x.codigo).trim()})),
 ].filter((m,i,a)=>a.findIndex(o=>o.url===m.url)===i).slice(0,max);
 const texto=out.texto.includes(codigo)?out.texto:`${out.texto.trim()}\n\nEscríbenos al WhatsApp con el código ${codigo} 💛`;
 const {data,error}=await db.from('contenido_piezas').insert({codigo,formato:p.formato,redes:p.redes,sede_id:p.sede_id,orden:p.orden.slice(0,1000),texto:texto.slice(0,2200),idea:out.idea.slice(0,600),medios,
  programada_at:p.programada_at,creado_por:userId,regla_id:p.regla_id||null,regla_fecha:p.regla_fecha||null,vestido_id:p.vestido_id||null,estado:'por_aprobar',error:medios.length<min?`Faltan fotos o videos: este formato necesita al menos ${min}. Agrega material a la biblioteca o cambia la orden.`:null}).select('id').single();
 if(error)throw error;
 return data.id as string;
}

type Res=Record<string,unknown>;
async function graph(path:string,token:string,params?:Record<string,string>){
 const r=await fetch(`https://graph.facebook.com/${version()}/${path}`,params?{method:'POST',body:new URLSearchParams({...params,access_token:token}),signal:AbortSignal.timeout(25000)}:{signal:AbortSignal.timeout(25000)});
 const d=await r.json().catch(()=>({})) as Res;
 if(!r.ok)throw Error(String((d.error as {error_user_msg?:string;message?:string})?.error_user_msg||(d.error as {message?:string})?.message||r.status));
 return d;
}
const get=(path:string,token:string)=>graph(`${path}${path.includes('?')?'&':'?'}access_token=${encodeURIComponent(token)}`,token);

/** Instagram: creates the container(s) and publishes when Meta finished processing them (videos take a while:
 *  the container stays in «resultado» and the next run continues). Returns true when published. */
async function publishInstagram(s:SocialSettings,tk:string,p:Pieza,state:Record<string,string>){
 if(state.id)return true;
 const ig=s.instagramId;if(!ig)throw Error('No hay cuenta de Instagram unida a la página (Integraciones).');
 const media=(m:Medio,extra:Record<string,string>)=>graph(`${ig}/media`,tk,{...(m.tipo==='video'?{video_url:m.url}:{image_url:m.url}),...extra});
 if(!state.container){
  const caption=p.texto||'';
  if(p.formato==='historia')state.container=String((await media(p.medios[0],{media_type:'STORIES'})).id);
  else if(p.formato==='reel')state.container=String((await media(p.medios[0],{media_type:'REELS',caption})).id);
  else if(p.medios.length===1)state.container=String((await media(p.medios[0],p.medios[0].tipo==='video'?{media_type:'REELS',caption}:{caption})).id);
  else{
   const children:string[]=[];
   for(const m of p.medios)children.push(String((await media(m,{is_carousel_item:'true',...(m.tipo==='video'?{media_type:'VIDEO'}:{})})).id));
   state.container=String((await graph(`${ig}/media`,tk,{media_type:'CAROUSEL',children:children.join(','),caption})).id);
  }
 }
 const st=String((await get(`${state.container}?fields=status_code`,tk)).status_code||'');
 if(st==='ERROR'||st==='EXPIRED')throw Error(`Instagram no pudo procesar el archivo (${st}). Revisa el formato del video o la foto.`);
 if(st!=='FINISHED'&&st!=='')return false;
 state.id=String((await graph(`${ig}/media_publish`,tk,{creation_id:state.container})).id);
 try{state.enlace=String((await get(`${state.id}?fields=permalink`,tk)).permalink||'');}catch{/* the link is optional */}
 return true;
}

/** Facebook page: photo, several photos in one post, or photo story. Videos and reels are published by hand for now. */
async function publishFacebook(s:SocialSettings,tk:string,p:Pieza,state:Record<string,string>){
 if(state.id)return true;
 if(p.medios.some(m=>m.tipo==='video'))throw Error('Los videos en Facebook todavía se publican a mano (descárgalo desde la pieza).');
 const page=s.pageId,message=p.texto||'';
 if(p.formato==='historia'){
  const photo=String((await graph(`${page}/photos`,tk,{url:p.medios[0].url,published:'false'})).id);
  state.id=String((await graph(`${page}/photo_stories`,tk,{photo_id:photo})).post_id||photo);
 }else if(p.medios.length===1)state.id=String((await graph(`${page}/photos`,tk,{url:p.medios[0].url,caption:message})).post_id||'');
 else{
  const ids:string[]=[];
  for(const m of p.medios)ids.push(String((await graph(`${page}/photos`,tk,{url:m.url,published:'false'})).id));
  state.id=String((await graph(`${page}/feed`,tk,{message,attached_media:JSON.stringify(ids.map(id=>({media_fbid:id})))})).id);
 }
 state.enlace=`https://www.facebook.com/${state.id}`;
 return true;
}

/** Publishes one approved piece on its networks; each network keeps its own result, so a retry only redoes what failed. */
export async function publishPiece(db:SupabaseClient,s:SocialSettings|null,p:Pieza){
 const meta=p.redes.some(r=>r==='instagram'||r==='facebook');
 if(meta&&!s)throw Error('Instagram y Facebook no están conectados (Integraciones).');
 const tk=meta&&s?await pageToken(s):'',resultado={...p.resultado},errores:string[]=[];let pendiente=false;
 for(const red of p.redes){
  const state=resultado[red]={...(resultado[red]||{})};
  if(red==='whatsapp'){state.estado='manual';continue;}
  try{
   const ok=red==='tiktok'?await publishTiktok(db,p,state):red==='instagram'?await publishInstagram(s!,tk,p,state):await publishFacebook(s!,tk,p,state);
   if(ok){state.estado='publicada';delete state.error;}else pendiente=true;
  }catch(e){state.estado='error';state.error=(e instanceof Error?e.message:'Error').slice(0,300);errores.push(`${red==='instagram'?'Instagram':red==='tiktok'?'TikTok':'Facebook'}: ${state.error}`);}
 }
 const estado=errores.length?'error':pendiente?'publicando':'publicada';
 await db.from('contenido_piezas').update({resultado,estado,error:errores.join(' · ')||null,publicado_at:estado==='publicada'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',p.id);
 return estado;
}
