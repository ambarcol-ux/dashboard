import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';
import {isPublicCatalogDress,type CatalogDress} from './catalog-public';
import {aiClient} from './ai-usage';

const MODEL='claude-haiku-5-5';
type Dress=CatalogDress&{id:string;codigo:string;talla:string|null;color:string|null;categoria:string|null;sede_actual_id:string|null;clasificacion_id:number|null};
const COLS='id,codigo,talla,color,categoria,sede_actual_id,clasificacion_id,foto_frente,foto_espalda,foto_detalle,imagen_url,precio_sugerido,para_alquiler,estado';
/** Main photo of a dress (front first), any format Claude reads. */
export const mainPhoto=(d:CatalogDress)=>[d.foto_frente,d.imagen_url,d.foto_espalda,d.foto_detalle].find(u=>u&&/^https:\/\//.test(u))||null;

/** Describes the photos of visible dresses that have no description yet (or whose photo changed). Returns how many were described. */
export async function describeDressPhotos(db:SupabaseClient,limit=25){
 const [{data:dresses},{data:done}]=await Promise.all([
  db.from('vestidos').select(COLS).eq('archivado',false),
  db.from('vestidos_ia_fotos').select('vestido_id,foto_url'),
 ]);
 const have=new Map(((done||[]) as {vestido_id:string;foto_url:string}[]).map(r=>[r.vestido_id,r.foto_url]));
 const todo=((dresses||[]) as Dress[]).filter(d=>isPublicCatalogDress(d)&&mainPhoto(d)&&have.get(d.id)!==mainPhoto(d)).slice(0,limit);
 const client=aiClient('fotos_describir');let n=0;
 for(let i=0;i<todo.length;i+=5)await Promise.all(todo.slice(i,i+5).map(async d=>{
  const url=mainPhoto(d)!;
  try{
   const r=await client.messages.create({model:MODEL,max_tokens:300,messages:[{role:'user',content:[{type:'image',source:{type:'url',url}},
    {type:'text',text:'Describe este vestido en español en máximo 45 palabras para reconocerlo luego en otra foto: silueta (princesa, sirena, recto, A), largo, color y tonos, escote, mangas o tirantes, espalda si se ve, tela y textura, adornos (pedrería, encaje, flores 3D, brillo, capa, cola). Solo la descripción, sin frases de introducción.'}]}]});
   const text=r.content.filter((b):b is Anthropic.TextBlock=>b.type==='text').map(b=>b.text).join(' ').trim().slice(0,600);
   if(text){await db.from('vestidos_ia_fotos').upsert({vestido_id:d.id,foto_url:url,descripcion:text,updated_at:new Date().toISOString()});n++;}
  }catch{/* next run retries */}
 }));
 return {descritos:n,pendientes:Math.max(0,todo.length-n)};
}

const PICK={type:'object',additionalProperties:false,required:['candidatos'],properties:{candidatos:{type:'array',items:{type:'integer'},description:'Números de línea (máximo 4) de los vestidos más parecidos, del más parecido al menos'}}};

/** The customer sent photos: finds up to 4 visible dresses that look most like them (from the photo descriptions)
 *  and returns them as content for the chat AI: each candidate's data and its photo, clearly marked as Ámbar's inventory. */
export async function inventoryCandidates(db:SupabaseClient,photos:Anthropic.ContentBlockParam[]):Promise<Anthropic.ContentBlockParam[]>{
 if(!photos.length)return [];
 const [{data:dresses},{data:desc},{data:sites},{data:types}]=await Promise.all([
  db.from('vestidos').select(COLS).eq('archivado',false),
  db.from('vestidos_ia_fotos').select('vestido_id,foto_url,descripcion'),
  db.from('sedes').select('id,nombre'),
  db.from('clasificaciones_vestido').select('id,nombre'),
 ]);
 const d=new Map(((desc||[]) as {vestido_id:string;foto_url:string;descripcion:string}[]).map(r=>[r.vestido_id,r]));
 const sede=new Map(((sites||[]) as {id:string;nombre:string}[]).map(s=>[s.id,s.nombre])),tipo=new Map(((types||[]) as {id:number;nombre:string}[]).map(t=>[t.id,t.nombre]));
 const list=((dresses||[]) as Dress[]).filter(x=>isPublicCatalogDress(x)&&d.has(x.id));
 if(!list.length)return [];
 const data=(x:Dress)=>`código ${String(x.codigo).trim()} · sede ${sede.get(x.sede_actual_id||'')||'—'} · ${tipo.get(x.clasificacion_id!)||'—'} · ${x.categoria||'—'} · talla ${x.talla||'—'} · color ${x.color||'—'} · alquiler $${Number(x.precio_sugerido).toLocaleString('es-CO')}`;
 const lines=list.map((x,i)=>`${i+1}. ${data(x)} · ${d.get(x.id)!.descripcion}`).join('\n');
 const r=await aiClient('fotos_comparar').messages.create({model:MODEL,max_tokens:300,output_config:{effort:'low',format:{type:'json_schema',schema:PICK}},
  messages:[{role:'user',content:[...photos,{type:'text',text:`Arriba están las fotos que envió una clienta. Abajo, el inventario de vestidos de Ámbar con la descripción de su foto. Elige los vestidos más parecidos a los de la clienta (mismo modelo primero, luego los más parecidos en silueta, color y adornos).\n\n${lines}`}]}]});
 const block=r.content.find((b):b is Anthropic.TextBlock=>b.type==='text');
 const nums=((block?JSON.parse(block.text):{candidatos:[]}) as {candidatos:number[]}).candidatos.filter(n=>n>=1&&n<=list.length);
 const picked=[...new Set(nums)].slice(0,4).map(n=>list[n-1]);
 if(!picked.length)return [];
 const out:Anthropic.ContentBlockParam[]=[{type:'text',text:'<candidatos_inventario> Estas fotos NO las envió la clienta: son vestidos del inventario de Ámbar que más se parecen a su foto. Compáralos con la foto de ella.'}];
 for(const x of picked)out.push({type:'text',text:`Candidato: ${data(x)}`},{type:'image',source:{type:'url',url:d.get(x.id)!.foto_url}});
 out.push({type:'text',text:'</candidatos_inventario>'});
 return out;
}
