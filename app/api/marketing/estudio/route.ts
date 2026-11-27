import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply} from '@/lib/public-db';
import {createPiece,publishPiece,type Formato,type Red,type Pieza} from '@/lib/content-studio';
import {loadSocialSettings,pageToken} from '@/lib/social-inbox';
import {adsPromote,PUBLICOS} from '@/lib/meta-ads';
import {FUENTES} from '@/components/BrandDesign';
export const dynamic='force-dynamic';
export const maxDuration=60;

const FORMATO_TXT:Record<string,string>={historia:'Historia',publicacion:'Publicación',carrusel:'Carrusel',reel:'Reel'};
const FORMATOS=['historia','publicacion','carrusel','reel'],REDES=['instagram','facebook','tiktok','whatsapp'];
const MIME:Record<string,string>={'image/jpeg':'jpg','video/mp4':'mp4','video/quicktime':'mov'};
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)?v:null;
/** Bogotá local date-time from the form (YYYY-MM-DDTHH:mm) to ISO. */
const bogota=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)?new Date(`${v}:00-05:00`).toISOString():null;

/** Marketing › Estudio de contenido. Creating and uploading: administration or the «Estudio de contenido» permission.
 *  Approving, publishing now and retrying: administration only. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 try{
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth}=await userDb.auth.getUser(bearer.slice(7));
  if(!auth.user)return publicReply({error:'Inicia sesión.'},401);
  const [{data:admin},{data:perms}]=await Promise.all([userDb.rpc('es_admin'),userDb.rpc('mis_permisos')]);
  const esAdmin=admin===true;
  if(!esAdmin&&!((perms||[]) as string[]).includes('panel.estudio_contenido'))return publicReply({error:'No tienes acceso al Estudio de contenido.'},403);
  const db=publicServerClient(),uid=auth.user.id;
  const b=await request.json().catch(()=>({})) as Record<string,unknown>;
  const soloAdmin=()=>publicReply({error:'Solo administración aprueba y publica.'},403);

  if(b.accion==='crear'){
   const formato=String(b.formato) as Formato,redes=(Array.isArray(b.redes)?b.redes:[]).map(String).filter(r=>REDES.includes(r)) as Red[],orden=String(b.orden||'').trim();
   if(!FORMATOS.includes(formato)||!redes.length||orden.length<5)return publicReply({error:'Escribe la orden (qué quieres publicar), el formato y al menos una red.'},400);
   const id=await createPiece(db,{orden,formato,redes,sede_id:uuid(b.sede_id),programada_at:bogota(b.programada_at)},uid);
   return publicReply({ok:true,id});
  }
  if(b.accion==='editar'){
   const id=uuid(b.id);if(!id)return publicReply({error:'Pieza no válida.'},400);
   const cambios:Record<string,unknown>={updated_at:new Date().toISOString()};
   if(typeof b.texto==='string')cambios.texto=b.texto.slice(0,2200);
   if('programada_at' in b)cambios.programada_at=bogota(b.programada_at);
   if(Array.isArray(b.quitar_medios)){
    const {data:p}=await db.from('contenido_piezas').select('medios').eq('id',id).single();
    const quitar=new Set(b.quitar_medios.map(String));cambios.medios=((p?.medios||[]) as {url:string}[]).filter(m=>!quitar.has(m.url));
   }
   const {error}=await db.from('contenido_piezas').update(cambios).eq('id',id).in('estado',['por_aprobar','aprobada','error']);
   if(error)throw error;return publicReply({ok:true});
  }
  if(b.accion==='descartar'){
   const id=uuid(b.id);if(!id)return publicReply({error:'Pieza no válida.'},400);
   await db.from('contenido_piezas').update({estado:'descartada',updated_at:new Date().toISOString()}).eq('id',id).in('estado',['por_aprobar','aprobada','error']);
   return publicReply({ok:true});
  }
  // Anuncios fase 3: promote a published piece as a click-to-WhatsApp ad, created paused (activated later in the portfolio). Administration only.
  if(b.accion==='promocionar'){
   if(!esAdmin)return soloAdmin();
   const id=uuid(b.id);if(!id)return publicReply({error:'Pieza no válida.'},400);
   const {data:p}=await db.from('contenido_piezas').select('id,sede_id,estado,resultado,codigo,formato,anuncio').eq('id',id).single();
   if(!p||p.estado!=='publicada')return publicReply({error:'Solo se promocionan piezas publicadas.'},400);
   if(p.anuncio)return publicReply({error:'Esta pieza ya tiene anuncio.'},400);
   if(p.formato==='historia')return publicReply({error:'Las historias no se promocionan; usa una publicación, carrusel o reel.'},400);
   const s=await loadSocialSettings(db);if(!s)return publicReply({error:'Instagram y Facebook no están conectados (Integraciones).'},400);
   const r=(p.resultado||{}) as Record<string,Record<string,string>>;
   const [{data:sd},{data:tp}]=await Promise.all([p.sede_id?db.from('sedes').select('nombre').eq('id',p.sede_id).maybeSingle():Promise.resolve({data:null}),
    db.from('config_parametros').select('valor').eq('clave','anuncios_tope_diario').maybeSingle()]);
   const publico=String(b.publico) as keyof typeof PUBLICOS;if(!(publico in PUBLICOS))return publicReply({error:'Elige el público.'},400);
   const ciudad=(sd as {nombre?:string}|null)?.nombre||null;
   try{
    const ids=await adsPromote({nombre:`ERP ${p.codigo||''} · ${ciudad||'Colombia'} · ${FORMATO_TXT[p.formato as string]||p.formato}`,ciudad,presupuesto:Number(b.presupuesto),dias:Number(b.dias),publico,
     pageId:s.pageId,igId:s.instagramId,igMediaId:r.instagram?.id,fbPostId:r.facebook?.id,tope:Number((tp as {valor?:unknown}|null)?.valor)||100000});
    const anuncio={...ids,publico,presupuesto:Number(b.presupuesto),dias:Number(b.dias),creado_por:uid,creado_at:new Date().toISOString()};
    await db.from('contenido_piezas').update({anuncio,updated_at:new Date().toISOString()}).eq('id',id);
    return publicReply({ok:true});
   }catch(e){return publicReply({error:e instanceof Error?e.message:'Meta no creó el anuncio.'},400);}
  }
  // A post published straight on Instagram (pasted link) becomes a «publicada» piece with its own code, so it can be promoted and measured like the rest.
  if(b.accion==='importar_ig'){
   if(!esAdmin)return soloAdmin();
   const corto=String(b.enlace||'').match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/)?.[1];
   if(!corto)return publicReply({error:'Pega el enlace de una publicación o reel de Instagram (instagram.com/reel/…).'},400);
   const s=await loadSocialSettings(db);if(!s?.instagramId)return publicReply({error:'Instagram no está conectado (Integraciones).'},400);
   const tk=await pageToken(s);
   type M={id:string;shortcode?:string;permalink?:string;media_product_type?:string;media_type?:string;caption?:string;media_url?:string;thumbnail_url?:string;timestamp?:string};
   let m:M|undefined,url=`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v21.0'}/${s.instagramId}/media?fields=id,shortcode,permalink,media_product_type,media_type,caption,media_url,thumbnail_url,timestamp&limit=50&access_token=${encodeURIComponent(tk)}`;
   for(let i=0;i<6&&url&&!m;i++){
    const r=await fetch(url,{signal:AbortSignal.timeout(15000)}).catch(()=>null);const d=await r?.json().catch(()=>null) as {data?:M[];paging?:{next?:string};error?:{message?:string}}|null;
    if(!r?.ok)return publicReply({error:d?.error?.message||'Instagram no respondió.'},400);
    m=(d?.data||[]).find(x=>x.shortcode===corto||String(x.permalink||'').includes(`/${corto}/`));url=d?.paging?.next||'';
   }
   if(!m)return publicReply({error:'No encontré esa publicación en la cuenta de Instagram conectada (solo las 300 más recientes de Ámbar).'},400);
   const {data:ya}=await db.from('contenido_piezas').select('id').eq('resultado->instagram->>id',m.id).maybeSingle();
   if(ya)return publicReply({error:'Esa publicación ya está en Piezas › Publicadas.'},400);
   const formato=m.media_product_type==='REELS'?'reel':m.media_type==='CAROUSEL_ALBUM'?'carrusel':'publicacion';
   const foto=m.media_type==='VIDEO'?m.thumbnail_url:m.media_url;
   const codigo='P'+Array.from(crypto.getRandomValues(new Uint8Array(5)),x=>'0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[x%34]).join('');
   const {error}=await db.from('contenido_piezas').insert({codigo,formato,redes:['instagram'],sede_id:uuid(b.sede_id),orden:`Publicada directamente en Instagram: ${m.permalink||b.enlace}`.slice(0,1000),
    texto:(m.caption||'').slice(0,2200)||null,medios:foto?[{url:foto,tipo:'imagen',fuente:'biblioteca',ref:'instagram',nota:'Publicada en Instagram'}]:[],estado:'publicada',
    resultado:{instagram:{id:m.id,estado:'publicada',...(m.permalink?{enlace:m.permalink}:{})}},publicado_at:m.timestamp||new Date().toISOString(),creado_por:uid,aprobado_por:uid,aprobado_at:new Date().toISOString()});
   if(error)throw error;return publicReply({ok:true});
  }
  if(b.accion==='aprobar'||b.accion==='publicar_ya'||b.accion==='reintentar'){
   if(!esAdmin)return soloAdmin();
   const id=uuid(b.id);if(!id)return publicReply({error:'Pieza no válida.'},400);
   const {data:p}=await db.from('contenido_piezas').select('id,formato,redes,sede_id,texto,medios,estado,resultado,error,programada_at').eq('id',id).single();
   if(!p||!['por_aprobar','aprobada','error'].includes(p.estado))return publicReply({error:'Esta pieza ya no se puede aprobar.'},400);
   if(!(p.medios as unknown[]).length)return publicReply({error:'La pieza no tiene fotos ni videos.'},400);
   // «Aprobar» waits for its scheduled time (now if none); «Publicar ya» and «Reintentar» publish right away (marked «publicando» so the cron does not take it too).
   const now=new Date().toISOString(),aprobar=b.accion==='aprobar';
   await db.from('contenido_piezas').update({estado:aprobar?'aprobada':'publicando',aprobado_por:uid,aprobado_at:now,programada_at:aprobar?p.programada_at||now:now,error:null,updated_at:now}).eq('id',id);
   if(aprobar)return publicReply({ok:true});
   const estado=await publishPiece(db,await loadSocialSettings(db),p as Pieza);
   return publicReply({ok:true,estado});
  }
  // Library: the browser uploads straight to Storage with a one-time signed URL (videos are too big for the server).
  if(b.accion==='subir'){
   const ext=MIME[String(b.tipo)];if(!ext)return publicReply({error:'Sube fotos JPG (se convierten solas) o videos MP4/MOV.'},400);
   const ruta=`${new Date().toISOString().slice(0,7)}/${crypto.randomUUID()}.${ext}`;
   const {data,error}=await db.storage.from('contenido_marketing').createSignedUploadUrl(ruta);
   if(error)throw error;return publicReply({ok:true,ruta,token:data.token});
  }
  if(b.accion==='registrar'){
   const ruta=String(b.ruta||'');if(!/^\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|mp4|mov)$/.test(ruta))return publicReply({error:'Archivo no válido.'},400);
   const url=db.storage.from('contenido_marketing').getPublicUrl(ruta).data.publicUrl;
   const etiquetas=(Array.isArray(b.etiquetas)?b.etiquetas:[]).map(x=>String(x).trim().toLowerCase().slice(0,30)).filter(Boolean).slice(0,12);
   const {error}=await db.from('contenido_biblioteca').insert({ruta,url,tipo:/\.jpg$/.test(ruta)?'imagen':'video',titulo:String(b.titulo||'').trim().slice(0,120)||null,etiquetas,sede_id:uuid(b.sede_id),
    tiene_clienta:b.tiene_clienta===true,autorizada:b.autorizada===true,subido_por:uid});
   if(error)throw error;return publicReply({ok:true});
  }
  // Kit de marca (administration): the logo goes up as PNG (keeps transparency); the rest are colors, fonts and texts.
  if(b.accion==='marca_logo'){
   if(!esAdmin)return publicReply({error:'Solo administración edita el kit de marca.'},403);
   const ruta=`marca/${crypto.randomUUID()}.png`;
   const {data,error}=await db.storage.from('contenido_marketing').createSignedUploadUrl(ruta);
   if(error)throw error;return publicReply({ok:true,ruta,token:data.token});
  }
  if(b.accion==='marca_guardar'){
   if(!esAdmin)return publicReply({error:'Solo administración edita el kit de marca.'},403);
   const color=(v:unknown,d:string)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:d,txt=(v:unknown,n:number)=>typeof v==='string'&&v.trim()?v.trim().slice(0,n):null;
   const cambios:Record<string,unknown>={color_principal:color(b.color_principal,'#1f1f1f'),color_secundario:color(b.color_secundario,'#c9a227'),color_texto:color(b.color_texto,'#ffffff'),
    fuente_titulo:FUENTES.includes(String(b.fuente_titulo))?b.fuente_titulo:'Playfair Display',fuente_texto:FUENTES.includes(String(b.fuente_texto))?b.fuente_texto:'Montserrat',
    usuario_instagram:txt(b.usuario_instagram,40)?.replace(/^@/,'')||null,frase:txt(b.frase,80),actualizado_por:uid,updated_at:new Date().toISOString()};
   if(typeof b.logo_ruta==='string'){if(!/^marca\/[0-9a-f-]{36}\.png$/.test(b.logo_ruta))return publicReply({error:'Logo no válido.'},400);cambios.logo_url=db.storage.from('contenido_marketing').getPublicUrl(b.logo_ruta).data.publicUrl;}
   const {error}=await db.from('contenido_marca').update(cambios).eq('id','principal');
   if(error)throw error;return publicReply({ok:true});
  }
  // Design template applied in the browser: the branded JPG replaces the photo in the piece; the original is kept to undo it.
  // Reel from the piece's photos: the recorded MP4 becomes its only medium; the photos are kept to undo it (ruta null).
  if(b.accion==='reel_fotos'){
   const id=uuid(b.id);if(!id)return publicReply({error:'Pieza no válida.'},400);
   const {data:p}=await db.from('contenido_piezas').select('medios,estado,formato').eq('id',id).single();
   if(!p||!['por_aprobar','aprobada','error'].includes(p.estado))return publicReply({error:'Esta pieza ya no se puede editar.'},400);
   const medios=(p.medios||[]) as Record<string,unknown>[],ruta=b.ruta==null?null:String(b.ruta);
   let nuevos:Record<string,unknown>[];
   if(ruta){
    if(!/^\d{4}-\d{2}\/[0-9a-f-]{36}\.mp4$/.test(ruta))return publicReply({error:'Archivo no válido.'},400);
    const fotos=medios.length===1&&Array.isArray(medios[0].fotos)?medios[0].fotos as Record<string,unknown>[]:medios.filter(m=>m.tipo==='imagen');
    if(fotos.length<2)return publicReply({error:'La pieza necesita al menos 2 fotos.'},400);
    nuevos=[{url:db.storage.from('contenido_marketing').getPublicUrl(ruta).data.publicUrl,tipo:'video',fuente:'biblioteca',ref:ruta,nota:'Reel de fotos',fotos}];
   }else{
    if(!(medios.length===1&&Array.isArray(medios[0].fotos)))return publicReply({error:'Esta pieza no tiene fotos para restaurar.'},400);
    nuevos=medios[0].fotos as Record<string,unknown>[];
   }
   const {error}=await db.from('contenido_piezas').update({medios:nuevos,updated_at:new Date().toISOString()}).eq('id',id);
   if(error)throw error;return publicReply({ok:true});
  }
  if(b.accion==='disenar'){
   const id=uuid(b.id),url=String(b.url||'');if(!id||!url)return publicReply({error:'Pieza no válida.'},400);
   const {data:p}=await db.from('contenido_piezas').select('medios,estado').eq('id',id).single();
   if(!p||!['por_aprobar','aprobada','error'].includes(p.estado))return publicReply({error:'Esta pieza ya no se puede editar.'},400);
   const ruta=b.ruta==null?null:String(b.ruta);
   if(ruta&&!/^\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|mp4)$/.test(ruta))return publicReply({error:'Archivo no válido.'},400);
   let hallado=false;
   const medios=((p.medios||[]) as Record<string,unknown>[]).map(m=>{
    if(m.url!==url)return m;hallado=true;
    const original=String(m.original||m.url);
    return ruta?{...m,url:db.storage.from('contenido_marketing').getPublicUrl(ruta).data.publicUrl,original,diseno:String(b.plantilla||'').slice(0,20)}:(()=>{const r:Record<string,unknown>={...m,url:original};delete r.original;delete r.diseno;return r;})();
   });
   if(!hallado)return publicReply({error:'La foto ya no está en la pieza.'},400);
   const {error}=await db.from('contenido_piezas').update({medios,updated_at:new Date().toISOString()}).eq('id',id);
   if(error)throw error;return publicReply({ok:true});
  }
  if(b.accion==='archivar'){
   const id=uuid(b.id);if(!id)return publicReply({error:'Archivo no válido.'},400);
   await db.from('contenido_biblioteca').update({archivado:true}).eq('id',id);return publicReply({ok:true});
  }
  // Rules (administration): what the ERP creates by itself each day; the pieces still wait for approval.
  if(b.accion==='regla_guardar'){
   if(!esAdmin)return publicReply({error:'Solo administración crea y cambia reglas.'},403);
   const r=(b.regla||{}) as Record<string,unknown>;
   const redes=(Array.isArray(r.redes)?r.redes:[]).map(String).filter(x=>REDES.includes(x)),dias=(Array.isArray(r.dias)?r.dias:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6);
   const fila={nombre:String(r.nombre||'').trim().slice(0,80),disparador:r.disparador==='vestido_nuevo'?'vestido_nuevo':'calendario',dias,hora:/^\d{2}:\d{2}$/.test(String(r.hora))?String(r.hora):'10:00',
    cantidad:Math.min(5,Math.max(1,Number(r.cantidad)||1)),formato:FORMATOS.includes(String(r.formato))?String(r.formato):'publicacion',redes,sede_id:uuid(r.sede_id),orden:String(r.orden||'').trim().slice(0,1000),activa:r.activa!==false,updated_at:new Date().toISOString()};
   if(fila.nombre.length<2||fila.orden.length<5||!redes.length||(fila.disparador==='calendario'&&!dias.length))return publicReply({error:'Completa el nombre, la orden, las redes y los días.'},400);
   const id=uuid(r.id);
   const {error}=id?await db.from('contenido_reglas').update(fila).eq('id',id):await db.from('contenido_reglas').insert({...fila,creado_por:uid});
   if(error)throw error;return publicReply({ok:true});
  }
  if(b.accion==='regla_activa'){
   if(!esAdmin)return publicReply({error:'Solo administración crea y cambia reglas.'},403);
   const id=uuid(b.id);if(!id)return publicReply({error:'Regla no válida.'},400);
   await db.from('contenido_reglas').update({activa:b.activa===true,updated_at:new Date().toISOString()}).eq('id',id);return publicReply({ok:true});
  }
  return publicReply({error:'Acción no válida.'},400);
 }catch(e){return publicReply({error:e instanceof Error?e.message.slice(0,300):'El servicio no está disponible.'},500);}
}
