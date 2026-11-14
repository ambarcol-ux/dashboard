'use client';
import {useCallback,useEffect,useState} from 'react';
import {Clapperboard} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';

type Medio={url:string;tipo:'imagen'|'video';fuente:string;ref:string;nota?:string};
type Pieza={id:string;formato:string;redes:string[];sede_id:string|null;orden:string|null;texto:string|null;idea:string|null;medios:Medio[];programada_at:string|null;estado:string;
 resultado:Record<string,{estado?:string;enlace?:string;error?:string}>;error:string|null;created_at:string};
type Lib={id:string;url:string;tipo:'imagen'|'video';titulo:string|null;etiquetas:string[];sede_id:string|null;tiene_clienta:boolean;autorizada:boolean};
type Sede={id:string;nombre:string};
type Regla={id?:string;nombre:string;activa:boolean;disparador:'calendario'|'vestido_nuevo';dias:number[];hora:string;cantidad:number;formato:string;redes:string[];sede_id:string|null;orden:string};
const DIAS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const FORMATO:Record<string,string>={historia:'Historia',publicacion:'Publicación',carrusel:'Carrusel',reel:'Reel'};
const RED:Record<string,string>={instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok',whatsapp:'Estado de WhatsApp'};
const ESTADO:Record<string,[string,string]>={por_aprobar:['Por aprobar','bg-amber-100 text-amber-800'],aprobada:['Programada','bg-sky-100 text-sky-800'],publicando:['Publicando…','bg-sky-100 text-sky-800'],
 publicada:['Publicada','bg-emerald-100 text-emerald-800'],error:['Con error','bg-red-100 text-red-700'],descartada:['Descartada','bg-gray-100 text-gray-500']};
const VISTAS:[string,string,string[]][]=[['aprobar','Por aprobar',['por_aprobar']],['programadas','Programadas',['aprobada','publicando']],['publicadas','Publicadas',['publicada']],['error','Con error',['error']],['descartadas','Descartadas',['descartada']]];
const EJEMPLOS=['Carrusel de 5 vestidos de XV en tonos rosa, con la promoción vigente','Historia de un vestido de gala rojo para Bogotá','Publicación de vestido de novia, estilo elegante, sin precio','Reel con el video más reciente de la biblioteca'];
const input='border border-gray-200 rounded-xl px-3 py-2 text-sm w-full bg-white';
/** ISO → value for <input type="datetime-local"> in Bogotá time. */
const local=(iso:string|null)=>iso?new Date(new Date(iso).getTime()-5*3600000).toISOString().slice(0,16):'';
const verFecha=(iso:string|null)=>iso?new Date(iso).toLocaleString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'lo antes posible';

async function api(body:Record<string,unknown>){
 const {data}=await supabase.auth.getSession();
 const r=await fetch('/api/marketing/estudio',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo completar.');return d;
}
/** Photos go up as JPEG (Instagram only accepts JPEG), at most 1440 px on the long side. */
async function toJpeg(f:File):Promise<Blob>{
 const img=await createImageBitmap(f),k=Math.min(1,1440/Math.max(img.width,img.height));
 const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
 c.getContext('2d')!.drawImage(img,0,0,c.width,c.height);
 return await new Promise<Blob>((ok,ko)=>c.toBlob(b=>b?ok(b):ko(Error('No se pudo convertir la foto.')),'image/jpeg',0.9));
}

/** Marketing › Estudio de contenido: pieces made by the AI with the real inventory and the library, approved by administration and published on Instagram and Facebook. */
export default function EstudioContenidoPage(){
 return <SupplierShell activePage="estudio_contenido" crumb="Marketing / Estudio de contenido" title="Estudio de contenido" icon={<Clapperboard/>}
  description="Pídele a la IA historias, publicaciones y carruseles con fotos reales del inventario y de tu biblioteca. Administración aprueba y el ERP publica en Instagram y Facebook a la hora programada; los estados de WhatsApp quedan listos para descargar.">
  {()=><Estudio/>}
 </SupplierShell>;
}

function Estudio(){
 const [tab,setTab]=useState<'piezas'|'nueva'|'reglas'|'biblioteca'>('piezas'),[reglas,setReglas]=useState<Regla[]>([]),[vista,setVista]=useState('aprobar');
 const [piezas,setPiezas]=useState<Pieza[]|null>(null),[lib,setLib]=useState<Lib[]>([]),[sedes,setSedes]=useState<Sede[]>([]),[admin,setAdmin]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{
  const [{data:p,error:e},{data:l},{data:s},{data:a},{data:rg}]=await Promise.all([
   supabase.from('contenido_piezas').select('id,formato,redes,sede_id,orden,texto,idea,medios,programada_at,estado,resultado,error,created_at').order('created_at',{ascending:false}).limit(150),
   supabase.from('contenido_biblioteca').select('id,url,tipo,titulo,etiquetas,sede_id,tiene_clienta,autorizada').eq('archivado',false).order('created_at',{ascending:false}).limit(300),
   supabase.from('sedes').select('id,nombre').order('nombre'),
   supabase.rpc('es_admin'),
   supabase.from('contenido_reglas').select('id,nombre,activa,disparador,dias,hora,cantidad,formato,redes,sede_id,orden').order('created_at'),
  ]);
  setReglas(((rg||[]) as Regla[]).map(r=>({...r,hora:String(r.hora).slice(0,5)})));
  if(e)setError(e.message);else setPiezas((p||[]) as Pieza[]);
  setLib((l||[]) as Lib[]);setSedes((s||[]) as Sede[]);setAdmin(a===true);
 },[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const run=async(key:string,body:Record<string,unknown>,ok?:()=>void)=>{setBusy(key);setError('');try{await api(body);ok?.();await load();}catch(e){setError(e instanceof Error?e.message:'Error');}setBusy('');};
 const sede=(id:string|null)=>sedes.find(s=>s.id===id)?.nombre||'Todas las sedes';
 const cuenta=(estados:string[])=>(piezas||[]).filter(p=>estados.includes(p.estado)).length;
 return <div className="space-y-4">
  <div className="flex gap-2 flex-wrap">
   {([['piezas','Piezas'],['nueva','Crear con IA'],['reglas',`Reglas · ${reglas.filter(r=>r.activa).length}`],['biblioteca',`Biblioteca · ${lib.length}`]] as const).map(([k,l])=><button key={k} type="button" onClick={()=>setTab(k)} className={`px-4 py-2 rounded-xl text-sm font-black ${tab===k?'bg-rose-600 text-white':'bg-white border'}`}>{l}</button>)}
  </div>
  {error&&<p className="text-red-600 font-bold text-sm">{error}</p>}
  {tab==='nueva'&&<Nueva sedes={sedes} busy={busy} onCrear={body=>run('crear',{accion:'crear',...body},()=>{setTab('piezas');setVista('aprobar');})}/>}
  {tab==='reglas'&&<Reglas reglas={reglas} sedes={sedes} admin={admin} busy={busy} run={run}/>}
  {tab==='biblioteca'&&<Biblioteca lib={lib} sedes={sedes} sede={sede} onChange={load} setError={setError} run={run} busy={busy}/>}
  {tab==='piezas'&&<>
   <div className="flex gap-2 flex-wrap">{VISTAS.map(([k,l,e])=><button key={k} type="button" onClick={()=>setVista(k)} className={`px-3 py-1.5 rounded-xl text-xs font-black ${vista===k?'bg-gray-900 text-white':'bg-white border'}`}>{l} · {cuenta(e)}</button>)}</div>
   {!piezas?<p className="text-gray-400 font-bold">Cargando…</p>:
   (()=>{const lista=piezas.filter(p=>VISTAS.find(v=>v[0]===vista)![2].includes(p.estado));
    return !lista.length?<p className="text-sm text-gray-500">No hay piezas aquí. Usa «Crear con IA» para pedir una.</p>:
    <div className="grid gap-4 lg:grid-cols-2">{lista.map(p=><Tarjeta key={`${p.id}:${p.estado}:${p.texto}:${p.programada_at}`} p={p} admin={admin} sede={sede(p.sede_id)} busy={busy} run={run}/>)}</div>;})()}
  </>}
 </div>;
}

function Nueva({sedes,busy,onCrear}:{sedes:Sede[];busy:string;onCrear:(b:Record<string,unknown>)=>void}){
 const [f,setF]=useState({orden:'',formato:'carrusel',redes:['instagram','facebook'] as string[],sede_id:'',programada_at:''});
 const toggle=(r:string)=>setF({...f,redes:f.redes.includes(r)?f.redes.filter(x=>x!==r):[...f.redes,r]});
 return <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 max-w-3xl">
  <label className="block text-sm font-black text-gray-700">¿Qué quieres publicar?
   <textarea className={`${input} mt-1 min-h-28`} value={f.orden} maxLength={1000} placeholder="Ej: carrusel de 5 vestidos de XV rojos talla M de Bogotá, con la promoción del 20 %" onChange={e=>setF({...f,orden:e.target.value})}/></label>
  <div className="flex gap-2 flex-wrap">{EJEMPLOS.map(x=><button key={x} type="button" onClick={()=>setF({...f,orden:x})} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold">{x}</button>)}</div>
  <div className="grid sm:grid-cols-3 gap-3">
   <label className="text-sm font-black text-gray-700">Formato<select className={`${input} mt-1`} value={f.formato} onChange={e=>setF({...f,formato:e.target.value})}>{Object.entries(FORMATO).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <label className="text-sm font-black text-gray-700">Sede<select className={`${input} mt-1`} value={f.sede_id} onChange={e=>setF({...f,sede_id:e.target.value})}><option value="">Todas</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   <label className="text-sm font-black text-gray-700">Publicar el (hora Colombia)<input type="datetime-local" className={`${input} mt-1`} value={f.programada_at} onChange={e=>setF({...f,programada_at:e.target.value})}/></label>
  </div>
  <div className="flex gap-4 flex-wrap text-sm font-bold text-gray-700">{Object.entries(RED).map(([k,l])=><label key={k} className="flex items-center gap-2"><input type="checkbox" checked={f.redes.includes(k)} onChange={()=>toggle(k)}/>{l}</label>)}</div>
  <p className="text-xs text-gray-500">La IA elige fotos reales del inventario (solo vestidos visibles en el catálogo) y de la biblioteca, y escribe el texto con los documentos de la marca y las promociones vigentes. La pieza queda «Por aprobar»: nada se publica sin aprobación de administración. Sin fecha, se publica apenas se apruebe.</p>
  <button type="button" disabled={!!busy||f.orden.trim().length<5||!f.redes.length} onClick={()=>onCrear(f)} className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{busy==='crear'?'La IA está creando…':'Crear con IA'}</button>
 </section>;
}

function Tarjeta({p,admin,sede,busy,run}:{p:Pieza;admin:boolean;sede:string;busy:string;run:(k:string,b:Record<string,unknown>)=>Promise<void>}){
 const [texto,setTexto]=useState(p.texto||''),[fecha,setFecha]=useState(local(p.programada_at));
 const editable=['por_aprobar','aprobada','error'].includes(p.estado),cambio=texto!==(p.texto||'')||fecha!==local(p.programada_at);
 const b=(k:string)=>busy===`${k}:${p.id}`;
 return <article className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
  <div className="flex justify-between gap-2 flex-wrap">
   <p className="font-black text-gray-900">{FORMATO[p.formato]} · {p.redes.map(r=>RED[r]).join(', ')}</p>
   <span className={`text-[11px] font-black px-2 py-1 rounded-full ${ESTADO[p.estado]?.[1]}`}>{ESTADO[p.estado]?.[0]||p.estado}</span>
  </div>
  <p className="text-xs text-gray-500">{sede} · publicar {verFecha(p.programada_at)}</p>
  {p.idea&&<p className="text-xs text-gray-600 italic">{p.idea}</p>}
  <div className="flex gap-2 overflow-x-auto pb-1">{p.medios.map(m=><div key={m.url} className="relative shrink-0">
   {m.tipo==='video'?<video src={m.url} className="h-40 rounded-xl" controls preload="metadata"/>:/* eslint-disable-next-line @next/next/no-img-element */<img src={m.url} alt={m.nota||''} className="h-40 rounded-xl object-cover"/>}
   {m.nota&&<span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 rounded">{m.nota}</span>}
   {editable&&p.medios.length>1&&<button type="button" title="Quitar" onClick={()=>void run(`quitar:${p.id}`,{accion:'editar',id:p.id,quitar_medios:[m.url]})} className="absolute top-1 right-1 bg-white/90 rounded-full w-6 h-6 text-xs font-black">✕</button>}
   {p.redes.includes('whatsapp')&&<a href={m.url} download target="_blank" rel="noopener noreferrer" className="absolute top-1 left-1 bg-white/90 rounded-lg px-1.5 text-[10px] font-black">Descargar</a>}
  </div>)}{!p.medios.length&&<p className="text-xs text-red-600 font-bold">Sin fotos ni videos.</p>}</div>
  {editable?<textarea className={`${input} min-h-28`} value={texto} maxLength={2200} onChange={e=>setTexto(e.target.value)}/>:<p className="text-sm text-gray-700 whitespace-pre-wrap">{p.texto}</p>}
  {editable&&<label className="block text-xs font-bold text-gray-600">Publicar el (hora Colombia)<input type="datetime-local" className={`${input} mt-1`} value={fecha} onChange={e=>setFecha(e.target.value)}/></label>}
  {p.error&&<p className="text-xs font-bold text-red-700 bg-red-50 rounded-lg px-2 py-1">{p.error}</p>}
  {Object.entries(p.resultado||{}).length>0&&<p className="text-xs text-gray-600">{Object.entries(p.resultado).map(([red,r])=><span key={red} className="mr-3">{RED[red]}: {r.estado==='manual'?'subir a mano':r.estado==='publicada'?<>✓ {r.enlace&&<a href={r.enlace} target="_blank" rel="noopener noreferrer" className="underline">ver</a>}</>:r.estado||'en proceso'}</span>)}</p>}
  {p.redes.includes('whatsapp')&&p.texto&&<button type="button" onClick={()=>void navigator.clipboard.writeText(p.texto||'')} className="text-xs font-black text-emerald-700 underline">Copiar texto para el estado de WhatsApp</button>}
  {editable&&<div className="flex gap-2 flex-wrap pt-1">
   {cambio&&<button type="button" disabled={!!busy} onClick={()=>void run(`guardar:${p.id}`,{accion:'editar',id:p.id,texto,programada_at:fecha})} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-black disabled:opacity-40">{b('guardar')?'Guardando…':'Guardar cambios'}</button>}
   {admin&&!cambio&&p.estado==='por_aprobar'&&<button type="button" disabled={!!busy||!p.medios.length} onClick={()=>void run(`aprobar:${p.id}`,{accion:'aprobar',id:p.id})} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black disabled:opacity-40">{b('aprobar')?'Aprobando…':p.programada_at?'Aprobar y programar':'Aprobar y publicar'}</button>}
   {admin&&!cambio&&(p.estado==='por_aprobar'||p.estado==='aprobada')&&<button type="button" disabled={!!busy||!p.medios.length} onClick={()=>{if(window.confirm('¿Publicar ahora en las redes elegidas?'))void run(`publicar_ya:${p.id}`,{accion:'publicar_ya',id:p.id});}} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-black disabled:opacity-40">{b('publicar_ya')?'Publicando…':'Publicar ya'}</button>}
   {admin&&!cambio&&p.estado==='error'&&<button type="button" disabled={!!busy} onClick={()=>void run(`reintentar:${p.id}`,{accion:'reintentar',id:p.id})} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-black disabled:opacity-40">{b('reintentar')?'Reintentando…':'Reintentar'}</button>}
   <button type="button" disabled={!!busy} onClick={()=>{if(window.confirm('¿Descartar esta pieza?'))void run(`descartar:${p.id}`,{accion:'descartar',id:p.id});}} className="px-3 py-1.5 rounded-lg border text-xs font-black text-gray-600">Descartar</button>
   {!admin&&p.estado==='por_aprobar'&&<span className="text-xs text-gray-500 self-center">Espera aprobación de administración.</span>}
  </div>}
 </article>;
}

function Biblioteca({lib,sedes,sede,onChange,setError,run,busy}:{lib:Lib[];sedes:Sede[];sede:(id:string|null)=>string;onChange:()=>Promise<void>;setError:(s:string)=>void;run:(k:string,b:Record<string,unknown>)=>Promise<void>;busy:string}){
 const [f,setF]=useState({titulo:'',etiquetas:'',sede_id:'',tiene_clienta:false,autorizada:false}),[files,setFiles]=useState<File[]>([]),[subiendo,setSubiendo]=useState('');
 const subir=async()=>{
  setError('');
  try{for(const [i,file] of files.entries()){
   setSubiendo(`Subiendo ${i+1} de ${files.length}…`);
   const video=file.type.startsWith('video/');
   if(video&&file.size>100*1024*1024)throw Error(`«${file.name}» pesa más de 100 MB.`);
   const blob=video?file:await toJpeg(file),tipo=video?(file.type==='video/quicktime'?'video/quicktime':'video/mp4'):'image/jpeg';
   const {ruta,token}=await api({accion:'subir',tipo});
   const {error}=await supabase.storage.from('contenido_marketing').uploadToSignedUrl(ruta,token,blob,{contentType:tipo});
   if(error)throw error;
   await api({accion:'registrar',ruta,titulo:f.titulo||file.name.replace(/\.[^.]+$/,''),etiquetas:f.etiquetas.split(','),sede_id:f.sede_id||null,tiene_clienta:f.tiene_clienta,autorizada:f.autorizada});
  }setFiles([]);setF({...f,titulo:''});await onChange();}catch(e){setError(e instanceof Error?e.message:'No se pudo subir.');}
  setSubiendo('');
 };
 return <div className="space-y-4">
  <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 max-w-3xl">
   <p className="font-black text-gray-900">Subir fotos y videos</p>
   <p className="text-xs text-gray-500">Eventos, tienda, detrás de cámaras o material de aliados. Las fotos se convierten a JPG; videos MP4 o MOV de hasta 100 MB. Las etiquetas ayudan a la IA a elegir.</p>
   <input type="file" multiple accept="image/*,video/mp4,video/quicktime" onChange={e=>setFiles([...(e.target.files||[])])} className="text-sm"/>
   <div className="grid sm:grid-cols-3 gap-3">
    <input className={input} placeholder="Título (opcional)" value={f.titulo} onChange={e=>setF({...f,titulo:e.target.value})}/>
    <input className={input} placeholder="Etiquetas: xv, rosa, evento…" value={f.etiquetas} onChange={e=>setF({...f,etiquetas:e.target.value})}/>
    <select className={input} value={f.sede_id} onChange={e=>setF({...f,sede_id:e.target.value})}><option value="">Todas las sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
   </div>
   <label className="flex gap-2 items-center text-sm font-bold text-gray-700"><input type="checkbox" checked={f.tiene_clienta} onChange={e=>setF({...f,tiene_clienta:e.target.checked,autorizada:e.target.checked&&f.autorizada})}/>Aparece una clienta</label>
   {f.tiene_clienta&&<label className="flex gap-2 items-center text-sm font-bold text-gray-700"><input type="checkbox" checked={f.autorizada} onChange={e=>setF({...f,autorizada:e.target.checked})}/>Tiene autorización de uso de imagen (si es menor, de su representante)</label>}
   <button type="button" disabled={!files.length||!!subiendo} onClick={()=>void subir()} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{subiendo||`Subir ${files.length||''}`}</button>
  </section>
  {!lib.length?<p className="text-sm text-gray-500">La biblioteca está vacía. Mientras tanto la IA usa las fotos del inventario.</p>:
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{lib.map(x=><div key={x.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
   {x.tipo==='video'?<video src={x.url} className="w-full h-36 object-cover" preload="metadata" controls/>:/* eslint-disable-next-line @next/next/no-img-element */<img src={x.url} alt={x.titulo||''} className="w-full h-36 object-cover"/>}
   <div className="p-2 space-y-0.5"><p className="text-xs font-black truncate">{x.titulo||'Sin título'}</p>
    <p className="text-[10px] text-gray-500 truncate">{sede(x.sede_id)}{x.etiquetas.length?` · ${x.etiquetas.join(', ')}`:''}</p>
    {x.tiene_clienta&&<p className={`text-[10px] font-black ${x.autorizada?'text-emerald-700':'text-red-600'}`}>{x.autorizada?'Clienta autorizada':'Clienta sin autorización: la IA no la usa'}</p>}
    <button type="button" disabled={!!busy} onClick={()=>{if(window.confirm('¿Quitar de la biblioteca?'))void run(`archivar:${x.id}`,{accion:'archivar',id:x.id});}} className="text-[10px] font-black text-gray-400 underline">Quitar</button></div>
  </div>)}</div>}
 </div>;
}

const NUEVA_REGLA:Regla={nombre:'',activa:true,disparador:'calendario',dias:[1,3,5],hora:'10:00',cantidad:1,formato:'historia',redes:['instagram','facebook'],sede_id:null,orden:''};
const EJEMPLOS_REGLA:[string,Partial<Regla>][]=[
 ['3 historias de XV lunes, miércoles y viernes',{nombre:'Historias de XV',dias:[1,3,5],cantidad:3,formato:'historia',orden:'Historia de un vestido de XV años distinto cada vez, con la promoción vigente si aplica.'}],
 ['Carrusel de gala los sábados',{nombre:'Carrusel de gala',dias:[6],cantidad:1,formato:'carrusel',orden:'Carrusel de 5 vestidos de gala variados en colores, invitando a agendar cita.'}],
 ['Vestido nuevo: publicación el mismo día',{nombre:'Vestido nuevo',disparador:'vestido_nuevo',cantidad:1,formato:'publicacion',orden:'Publicación presentando el vestido nuevo del inventario, sin precio, invitando a agendar cita para probárselo.'}],
];

/** Rules: the ERP creates these pieces each morning by itself (calendar) or when a dress enters the inventory; they wait for approval. */
function Reglas({reglas,sedes,admin,busy,run}:{reglas:Regla[];sedes:Sede[];admin:boolean;busy:string;run:(k:string,b:Record<string,unknown>)=>Promise<void>}){
 const [edit,setEdit]=useState<Regla|null>(null);
 const sede=(id:string|null)=>sedes.find(s=>s.id===id)?.nombre||'Todas las sedes';
 const toggle=<T,>(arr:T[],v:T)=>arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];
 return <div className="space-y-4">
  <p className="text-sm text-gray-600 max-w-3xl">Cada mañana (5 a 9 a. m.) el ERP crea las piezas de las reglas activas y las programa a la hora de la regla. Todas quedan «Por aprobar»: nada se publica sin tu aprobación. No repite vestidos usados en las últimas 2 semanas.</p>
  {admin&&!edit&&<div className="flex gap-2 flex-wrap"><button type="button" onClick={()=>setEdit(NUEVA_REGLA)} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black">Nueva regla</button>
   {EJEMPLOS_REGLA.map(([l,r])=><button key={l} type="button" onClick={()=>setEdit({...NUEVA_REGLA,...r})} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold">{l}</button>)}</div>}
  {edit&&<section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 max-w-3xl">
   <div className="grid sm:grid-cols-2 gap-3">
    <label className="text-sm font-black text-gray-700">Nombre<input className={`${input} mt-1`} value={edit.nombre} onChange={e=>setEdit({...edit,nombre:e.target.value})}/></label>
    <label className="text-sm font-black text-gray-700">Cuándo<select className={`${input} mt-1`} value={edit.disparador} onChange={e=>setEdit({...edit,disparador:e.target.value as Regla['disparador']})}><option value="calendario">Días fijos de la semana</option><option value="vestido_nuevo">Cada vestido nuevo del inventario</option></select></label>
   </div>
   {edit.disparador==='calendario'&&<div className="flex gap-2 flex-wrap">{DIAS.map((d,i)=><button key={d} type="button" onClick={()=>setEdit({...edit,dias:toggle(edit.dias,i)})} className={`px-3 py-1.5 rounded-lg text-xs font-black ${edit.dias.includes(i)?'bg-gray-900 text-white':'bg-white border'}`}>{d}</button>)}</div>}
   <div className="grid sm:grid-cols-4 gap-3">
    <label className="text-sm font-black text-gray-700">Hora<input type="time" className={`${input} mt-1`} value={edit.hora} onChange={e=>setEdit({...edit,hora:e.target.value})}/></label>
    {edit.disparador==='calendario'&&<label className="text-sm font-black text-gray-700">Piezas por día<input type="number" min={1} max={5} className={`${input} mt-1`} value={edit.cantidad} onChange={e=>setEdit({...edit,cantidad:Number(e.target.value)})}/></label>}
    <label className="text-sm font-black text-gray-700">Formato<select className={`${input} mt-1`} value={edit.formato} onChange={e=>setEdit({...edit,formato:e.target.value})}>{Object.entries(FORMATO).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
    <label className="text-sm font-black text-gray-700">Sede<select className={`${input} mt-1`} value={edit.sede_id||''} onChange={e=>setEdit({...edit,sede_id:e.target.value||null})}><option value="">Todas</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   </div>
   <div className="flex gap-4 flex-wrap text-sm font-bold text-gray-700">{Object.entries(RED).map(([k,l])=><label key={k} className="flex items-center gap-2"><input type="checkbox" checked={edit.redes.includes(k)} onChange={()=>setEdit({...edit,redes:toggle(edit.redes,k)})}/>{l}</label>)}</div>
   <label className="block text-sm font-black text-gray-700">Orden para la IA<textarea className={`${input} mt-1 min-h-24`} value={edit.orden} maxLength={1000} onChange={e=>setEdit({...edit,orden:e.target.value})}/></label>
   <div className="flex gap-2"><button type="button" disabled={!!busy} onClick={()=>void run('regla',{accion:'regla_guardar',regla:edit}).then(()=>setEdit(null))} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{busy==='regla'?'Guardando…':'Guardar regla'}</button>
    <button type="button" onClick={()=>setEdit(null)} className="px-4 py-2 rounded-xl border text-sm font-black text-gray-600">Cancelar</button></div>
  </section>}
  {!reglas.length?<p className="text-sm text-gray-500">Aún no hay reglas.</p>:<div className="grid gap-3 md:grid-cols-2">{reglas.map(r=><article key={r.id} className={`bg-white rounded-2xl border p-4 space-y-1 ${r.activa?'border-gray-100':'border-dashed border-gray-200 opacity-60'}`}>
   <div className="flex justify-between gap-2"><p className="font-black text-gray-900">{r.nombre}</p><span className="text-[11px] font-black text-gray-400">{r.activa?'Activa':'Pausada'}</span></div>
   <p className="text-xs text-gray-600">{r.disparador==='vestido_nuevo'?'Cada vestido nuevo':`${r.dias.map(d=>DIAS[d]).join(', ')} · ${r.cantidad} por día`} · {r.hora} · {FORMATO[r.formato]} · {r.redes.map(x=>RED[x]).join(', ')} · {sede(r.sede_id)}</p>
   <p className="text-xs text-gray-500 italic">{r.orden}</p>
   {admin&&<div className="flex gap-2 pt-1"><button type="button" onClick={()=>setEdit(r)} className="px-3 py-1.5 rounded-lg border text-xs font-black">Editar</button>
    <button type="button" disabled={!!busy} onClick={()=>void run(`activa:${r.id}`,{accion:'regla_activa',id:r.id,activa:!r.activa})} className="px-3 py-1.5 rounded-lg border text-xs font-black">{r.activa?'Pausar':'Activar'}</button></div>}
  </article>)}</div>}
 </div>;
}
