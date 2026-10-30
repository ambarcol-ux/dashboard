'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {toast} from 'sonner';
import {Lock,Plus,ArrowUp,ArrowDown,ListChecks,SlidersHorizontal,FileText,History} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {loadConfig} from '@/lib/config';

type Lista={clave:string;nombre:string;modulo:string;descripcion:string;cerrada:boolean;uso:string[]|null;activo:boolean};
type Item={lista:string;valor:string;etiqueta:string|null;orden:number;activo:boolean;bloqueado:boolean};
type Param={clave:string;nombre:string;modulo:string;descripcion:string;tipo:'entero'|'decimal'|'texto'|'booleano';valor:unknown;minimo:number|null;maximo:number|null;bloqueado:boolean;uso:string|null;activo:boolean};
type Campo={campo:string;etiqueta:string;tipo:string;lista?:string;obligatorio?:boolean;bloqueado?:boolean};
type Form={clave:string;nombre:string;modulo:string;descripcion:string;campos:Campo[];uso:string|null;activo:boolean};
type Hist={id:string;tabla:string;clave:string;accion:string;anterior:Record<string,unknown>|null;nuevo:Record<string,unknown>|null;usuario_id:string|null;created_at:string};

const TABS=[{id:'listas',label:'Listas',icon:ListChecks},{id:'parametros',label:'Parámetros',icon:SlidersHorizontal},{id:'formularios',label:'Formularios',icon:FileText},{id:'historial',label:'Historial',icon:History}] as const;
const TABLA:Record<string,string>={config_listas:'Lista',listas_contrato:'Valor de lista',config_parametros:'Parámetro',config_formularios:'Formulario'};
const slug=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').replace(/^(\d)/,'x$1').slice(0,40);
const card='bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm';
const input='px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-500';
const btn='px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-40';
const Locked=({title}:{title:string})=><span title={title} className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-gray-500 bg-gray-100 px-2 py-1 rounded-lg"><Lock className="w-3 h-3"/>Bloqueado</span>;

export default function ConfigCatalog(){
 const [tab,setTab]=useState<typeof TABS[number]['id']>('listas');
 const [listas,setListas]=useState<Lista[]>([]),[items,setItems]=useState<Item[]>([]),[params,setParams]=useState<Param[]>([]),[forms,setForms]=useState<Form[]>([]),[hist,setHist]=useState<Hist[]>([]),[names,setNames]=useState<Record<string,string>>({});
 const [sel,setSel]=useState(''),[selForm,setSelForm]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const load=useCallback(async()=>{
  const [l,i,p,f,h]=await Promise.all([
   supabase.from('config_listas').select('*').order('modulo').order('nombre'),
   supabase.from('listas_contrato').select('lista,valor,etiqueta,orden,activo,bloqueado').order('orden'),
   supabase.from('config_parametros').select('*').order('modulo').order('nombre'),
   supabase.from('config_formularios').select('*').order('modulo').order('nombre'),
   supabase.from('config_historial').select('*').order('created_at',{ascending:false}).limit(150),
  ]);
  const err=[l,i,p,f,h].find(x=>x.error)?.error;
  if(err){toast.error('No se pudo cargar la configuración: '+err.message);setReady(true);return;}
  setListas(l.data as Lista[]);setItems(i.data as Item[]);setParams(p.data as Param[]);setForms(f.data as Form[]);setHist(h.data as Hist[]);
  const ids=[...new Set((h.data as Hist[]).map(x=>x.usuario_id).filter(Boolean))] as string[];
  if(ids.length){const {data}=await supabase.from('profiles').select('id,nombre,email').in('id',ids);setNames(Object.fromEntries((data||[]).map(x=>[x.id,x.nombre||x.email])));}
  setReady(true);void loadConfig(true);
 },[]);
 useEffect(()=>{void load();},[load]);
 async function run(work:()=>PromiseLike<{error:{message:string}|null}>,ok:string){
  if(busy)return;setBusy(true);
  try{const {error}=await work();if(error)toast.error(error.message);else toast.success(ok);await load();}finally{setBusy(false);}
 }
 async function quitar(tipo:string,clave:string,valor?:string){
  if(busy)return;setBusy(true);
  try{const {data,error}=await supabase.rpc('config_quitar',{p_tipo:tipo,p_clave:clave,p_valor:valor??null});if(error)toast.error(error.message);else toast.success(data==='eliminado'?'Eliminado.':'Ya estaba en uso: quedó desactivado.');await load();}finally{setBusy(false);}
 }

 return <section className="mt-10 space-y-6" aria-labelledby="config-reutilizable">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <h2 id="config-reutilizable" className="text-xl font-black text-gray-900 uppercase tracking-tight">Listas, parámetros y formularios</h2>
   <p className="text-xs text-gray-500 max-w-xl">Lo que ya se usó se desactiva en lugar de borrarse. Lo bloqueado lo usa el sistema: se ve, pero no se cambia.</p>
  </div>
  <div role="tablist" className="flex flex-wrap gap-2">
   {TABS.map(t=><button key={t.id} id={`cfg-tab-${t.id}`} role="tab" type="button" aria-selected={tab===t.id} onClick={()=>setTab(t.id)} className={`${btn} inline-flex items-center gap-2 ${tab===t.id?'bg-rose-500 text-white':'bg-white text-gray-600 border border-gray-200'}`}><t.icon className="w-4 h-4"/>{t.label}</button>)}
  </div>
  {!ready?<p role="status" className="text-sm text-gray-500">Cargando configuración…</p>
  :tab==='listas'?<Listas {...{listas,items,sel,setSel,busy,run,quitar}}/>
  :tab==='parametros'?<Parametros {...{params,busy,run,quitar}}/>
  :tab==='formularios'?<Formularios {...{forms,listas,sel:selForm,setSel:setSelForm,busy,run,quitar}}/>
  :<Historial hist={hist} names={names}/>}
 </section>;
}

type Run=(work:()=>PromiseLike<{error:{message:string}|null}>,ok:string)=>Promise<void>;
type Quitar=(tipo:string,clave:string,valor?:string)=>Promise<void>;

function Listas({listas,items,sel,setSel,busy,run,quitar}:{listas:Lista[];items:Item[];sel:string;setSel:(v:string)=>void;busy:boolean;run:Run;quitar:Quitar}){
 const [nueva,setNueva]=useState({nombre:'',modulo:''}),[valor,setValor]=useState('');
 const lista=listas.find(l=>l.clave===sel)||listas[0];
 const rows=items.filter(i=>i.lista===lista?.clave);
 const modulos=useMemo(()=>[...new Set(listas.map(l=>l.modulo))],[listas]);
 const move=(i:number,d:number)=>{const a=rows[i],b=rows[i+d];if(!a||!b)return;void run(async()=>{const r1=await supabase.from('listas_contrato').update({orden:i+d+1}).eq('lista',a.lista).eq('valor',a.valor);if(r1.error)return r1;return supabase.from('listas_contrato').update({orden:i+1}).eq('lista',b.lista).eq('valor',b.valor);},'Orden actualizado.');};
 return <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 items-start">
  <div className={`${card} space-y-4`}>
   {modulos.map(m=><div key={m}><h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">{m}</h3><ul className="space-y-1">
    {listas.filter(l=>l.modulo===m).map(l=><li key={l.clave}><button type="button" onClick={()=>setSel(l.clave)} className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center justify-between gap-2 ${lista?.clave===l.clave?'bg-rose-50 text-rose-700 font-bold':'hover:bg-gray-50 text-gray-700'}`}><span className={l.activo?'':'line-through text-gray-400'}>{l.nombre}</span>{l.cerrada&&<Lock className="w-3 h-3 text-gray-400 shrink-0" aria-label="Lista del sistema"/>}</button></li>)}
   </ul></div>)}
   <form className="border-t border-gray-100 pt-4 space-y-2" onSubmit={e=>{e.preventDefault();const clave=slug(nueva.nombre);if(clave.length<2)return;void run(()=>supabase.from('config_listas').insert({clave,nombre:nueva.nombre.trim(),modulo:nueva.modulo.trim()||'General'}),'Lista creada.').then(()=>{setNueva({nombre:'',modulo:''});setSel(clave);});}}>
    <h3 className="text-xs font-black uppercase text-gray-600">Nueva lista</h3>
    <input id="cfg-lista-nombre" className={`${input} w-full`} placeholder="Nombre (ej. Colores de vestido)" value={nueva.nombre} onChange={e=>setNueva({...nueva,nombre:e.target.value})}/>
    <input id="cfg-lista-modulo" className={`${input} w-full`} placeholder="Módulo (ej. Inventario)" list="cfg-modulos" value={nueva.modulo} onChange={e=>setNueva({...nueva,modulo:e.target.value})}/>
    <datalist id="cfg-modulos">{modulos.map(m=><option key={m} value={m}/>)}</datalist>
    <button className={`${btn} bg-gray-900 text-white inline-flex items-center gap-1`} disabled={busy||slug(nueva.nombre).length<2}><Plus className="w-3 h-3"/>Crear lista</button>
   </form>
  </div>
  {lista&&<div className={`${card} space-y-4 min-w-0`}>
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0"><h3 className="text-lg font-black text-gray-900">{lista.nombre}</h3><p className="text-sm text-gray-500">{lista.descripcion||'Sin descripción.'}</p><p className="text-[11px] text-gray-400 font-mono mt-1 break-all">{lista.clave}</p></div>
    {lista.cerrada?<Locked title="El sistema valida estos valores: no admite valores nuevos ni se puede quitar."/>
    :<div className="flex gap-2"><button type="button" className={`${btn} border border-gray-200`} disabled={busy} onClick={()=>void run(()=>supabase.from('config_listas').update({activo:!lista.activo}).eq('clave',lista.clave),lista.activo?'Lista desactivada.':'Lista activada.')}>{lista.activo?'Desactivar':'Activar'}</button><button type="button" className={`${btn} border border-rose-200 text-rose-600`} disabled={busy} onClick={()=>void quitar('lista',lista.clave)}>Quitar lista</button></div>}
   </div>
   {lista.cerrada&&<p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3">Puedes ordenar, renombrar o desactivar los valores sin candado. Los valores con candado siempre se muestran.</p>}
   <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th className="py-2 pr-2">Orden</th><th className="py-2 pr-2">Valor guardado</th><th className="py-2 pr-2">Se muestra como</th><th className="py-2 pr-2">Estado</th><th className="py-2"></th></tr></thead>
    <tbody>{rows.map((r,i)=><tr key={r.valor} className="border-t border-gray-100">
     <td className="py-2 pr-2 whitespace-nowrap"><button type="button" aria-label="Subir" className="p-1 disabled:opacity-30" disabled={busy||i===0} onClick={()=>move(i,-1)}><ArrowUp className="w-4 h-4"/></button><button type="button" aria-label="Bajar" className="p-1 disabled:opacity-30" disabled={busy||i===rows.length-1} onClick={()=>move(i,1)}><ArrowDown className="w-4 h-4"/></button></td>
     <td className="py-2 pr-2 font-mono text-xs break-all">{r.valor}</td>
     <td className="py-2 pr-2"><input aria-label={`Etiqueta de ${r.valor}`} className={`${input} w-full min-w-[10rem]`} disabled={busy||r.bloqueado} defaultValue={r.etiqueta||''} placeholder={r.valor} onBlur={e=>{const v=e.target.value.trim()||null;if(v!==(r.etiqueta||null))void run(()=>supabase.from('listas_contrato').update({etiqueta:v}).eq('lista',r.lista).eq('valor',r.valor),'Etiqueta guardada.');}}/></td>
     <td className="py-2 pr-2">{r.bloqueado?<Locked title="El sistema depende de este valor."/>:<button type="button" disabled={busy} className={`text-xs font-bold px-2 py-1 rounded-lg ${r.activo?'bg-emerald-50 text-emerald-700':'bg-gray-100 text-gray-500'}`} onClick={()=>void run(()=>supabase.from('listas_contrato').update({activo:!r.activo}).eq('lista',r.lista).eq('valor',r.valor),r.activo?'Valor desactivado.':'Valor activado.')}>{r.activo?'Activo':'Inactivo'}</button>}</td>
     <td className="py-2 text-right">{!r.bloqueado&&!lista.cerrada&&<button type="button" disabled={busy} className="text-xs font-bold text-rose-600" onClick={()=>void quitar('item',r.lista,r.valor)}>Quitar</button>}</td>
    </tr>)}{rows.length===0&&<tr><td colSpan={5} className="py-4 text-gray-500">Esta lista aún no tiene valores.</td></tr>}</tbody>
   </table></div>
   {!lista.cerrada&&<form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();const v=valor.trim();if(!v)return;void run(()=>supabase.from('listas_contrato').insert({lista:lista.clave,valor:v,orden:(rows.at(-1)?.orden||0)+1}),'Valor agregado.').then(()=>setValor(''));}}>
    <input id="cfg-valor-nuevo" className={`${input} flex-1 min-w-0`} maxLength={120} placeholder="Nuevo valor" value={valor} onChange={e=>setValor(e.target.value)}/>
    <button className={`${btn} bg-rose-500 text-white inline-flex items-center gap-1`} disabled={busy||!valor.trim()}><Plus className="w-3 h-3"/>Agregar</button>
   </form>}
  </div>}
 </div>;
}

function Parametros({params,busy,run,quitar}:{params:Param[];busy:boolean;run:Run;quitar:Quitar}){
 const [draft,setDraft]=useState<Record<string,string>>({}),[nuevo,setNuevo]=useState({nombre:'',modulo:'',tipo:'entero',valor:'',minimo:'',maximo:''});
 const parse=(tipo:string,v:string)=>tipo==='booleano'?v==='true':tipo==='texto'?v:Number(v);
 return <div className="space-y-6">
  <div className={`${card} overflow-x-auto`}><table className="w-full text-sm">
   <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th className="py-2 pr-3">Parámetro</th><th className="py-2 pr-3">Valor</th><th className="py-2 pr-3">Rango</th><th className="py-2"></th></tr></thead>
   <tbody>{params.map(p=>{const cur=draft[p.clave]??String(p.valor);const dirty=cur!==String(p.valor);return <tr key={p.clave} className="border-t border-gray-100 align-top">
    <td className="py-3 pr-3 min-w-[14rem]"><p className={`font-bold ${p.activo?'text-gray-900':'text-gray-400 line-through'}`}>{p.nombre}</p><p className="text-xs text-gray-500">{p.modulo} · {p.descripcion}</p></td>
    <td className="py-3 pr-3">{p.tipo==='booleano'?<select aria-label={p.nombre} className={input} disabled={busy||p.bloqueado} value={cur} onChange={e=>setDraft({...draft,[p.clave]:e.target.value})}><option value="true">Sí</option><option value="false">No</option></select>
     :<input aria-label={p.nombre} className={`${input} w-32 tabular-nums`} disabled={busy||p.bloqueado} inputMode={p.tipo==='texto'?'text':'decimal'} value={cur} onChange={e=>setDraft({...draft,[p.clave]:e.target.value})}/>}</td>
    <td className="py-3 pr-3 text-xs text-gray-500 tabular-nums whitespace-nowrap">{p.minimo!==null||p.maximo!==null?`${p.minimo??'—'} a ${p.maximo??'—'}`:'—'}</td>
    <td className="py-3 text-right whitespace-nowrap space-x-2">{p.bloqueado?<Locked title="Cálculo o validación del sistema."/>:<>
     <button type="button" className={`${btn} bg-rose-500 text-white`} disabled={busy||!dirty} onClick={()=>void run(()=>supabase.from('config_parametros').update({valor:parse(p.tipo,cur)}).eq('clave',p.clave),'Parámetro guardado.').then(()=>setDraft(d=>{const n={...d};delete n[p.clave];return n;}))}>Guardar</button>
     <button type="button" className={`${btn} border border-gray-200`} disabled={busy} onClick={()=>void run(()=>supabase.from('config_parametros').update({activo:!p.activo}).eq('clave',p.clave),p.activo?'Parámetro desactivado.':'Parámetro activado.')}>{p.activo?'Desactivar':'Activar'}</button>
     {!p.uso&&<button type="button" className="text-xs font-bold text-rose-600" disabled={busy} onClick={()=>void quitar('parametro',p.clave)}>Quitar</button>}</>}</td>
   </tr>;})}</tbody>
  </table></div>
  <form className={`${card} grid grid-cols-1 sm:grid-cols-3 gap-2`} onSubmit={e=>{e.preventDefault();const clave=slug(nuevo.nombre);if(clave.length<2||nuevo.valor==='')return;void run(()=>supabase.from('config_parametros').insert({clave,nombre:nuevo.nombre.trim(),modulo:nuevo.modulo.trim()||'General',tipo:nuevo.tipo,valor:parse(nuevo.tipo,nuevo.valor),minimo:nuevo.minimo===''?null:Number(nuevo.minimo),maximo:nuevo.maximo===''?null:Number(nuevo.maximo)}),'Parámetro creado.').then(()=>setNuevo({nombre:'',modulo:'',tipo:'entero',valor:'',minimo:'',maximo:''}));}}>
   <h3 className="sm:col-span-3 text-xs font-black uppercase text-gray-600">Nuevo parámetro</h3>
   <input id="cfg-param-nombre" className={input} placeholder="Nombre" value={nuevo.nombre} onChange={e=>setNuevo({...nuevo,nombre:e.target.value})}/>
   <input id="cfg-param-modulo" className={input} placeholder="Módulo" value={nuevo.modulo} onChange={e=>setNuevo({...nuevo,modulo:e.target.value})}/>
   <select id="cfg-param-tipo" className={input} value={nuevo.tipo} onChange={e=>setNuevo({...nuevo,tipo:e.target.value,valor:e.target.value==='booleano'?'true':''})}><option value="entero">Número entero</option><option value="decimal">Número decimal</option><option value="texto">Texto</option><option value="booleano">Sí / No</option></select>
   {nuevo.tipo==='booleano'?<select id="cfg-param-valor" className={input} value={nuevo.valor} onChange={e=>setNuevo({...nuevo,valor:e.target.value})}><option value="true">Sí</option><option value="false">No</option></select>:<input id="cfg-param-valor" className={input} placeholder="Valor" value={nuevo.valor} onChange={e=>setNuevo({...nuevo,valor:e.target.value})}/>}
   {(nuevo.tipo==='entero'||nuevo.tipo==='decimal')&&<><input id="cfg-param-min" className={input} inputMode="decimal" placeholder="Mínimo (opcional)" value={nuevo.minimo} onChange={e=>setNuevo({...nuevo,minimo:e.target.value})}/><input id="cfg-param-max" className={input} inputMode="decimal" placeholder="Máximo (opcional)" value={nuevo.maximo} onChange={e=>setNuevo({...nuevo,maximo:e.target.value})}/></>}
   <div className="sm:col-span-3"><button className={`${btn} bg-gray-900 text-white inline-flex items-center gap-1`} disabled={busy||slug(nuevo.nombre).length<2||nuevo.valor===''}><Plus className="w-3 h-3"/>Crear parámetro</button></div>
  </form>
 </div>;
}

function Formularios({forms,listas,sel,setSel,busy,run,quitar}:{forms:Form[];listas:Lista[];sel:string;setSel:(v:string)=>void;busy:boolean;run:Run;quitar:Quitar}){
 const form=forms.find(f=>f.clave===sel)||forms[0];
 const [campos,setCampos]=useState<Campo[]>(form?.campos||[]),[nuevo,setNuevo]=useState({nombre:'',modulo:''}),[campo,setCampo]=useState<Campo>({campo:'',etiqueta:'',tipo:'texto',obligatorio:false});
 useEffect(()=>{setCampos(form?.campos||[]);},[form]);
 const dirty=JSON.stringify(campos)!==JSON.stringify(form?.campos||[]);
 const upd=(i:number,c:Partial<Campo>)=>setCampos(cs=>cs.map((x,j)=>j===i?{...x,...c}:x));
 const mover=(i:number,d:number)=>setCampos(cs=>{const n=[...cs];const t=n[i+d];if(!t)return cs;n[i+d]=n[i];n[i]=t;return n;});
 return <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 items-start">
  <div className={`${card} space-y-3`}>
   <ul className="space-y-1">{forms.map(f=><li key={f.clave}><button type="button" onClick={()=>setSel(f.clave)} className={`w-full text-left px-3 py-2 rounded-xl text-sm ${form?.clave===f.clave?'bg-rose-50 text-rose-700 font-bold':'hover:bg-gray-50 text-gray-700'}`}><span className={f.activo?'':'line-through text-gray-400'}>{f.nombre}</span><span className="block text-[11px] text-gray-400">{f.modulo}</span></button></li>)}</ul>
   <form className="border-t border-gray-100 pt-4 space-y-2" onSubmit={e=>{e.preventDefault();const clave=slug(nuevo.nombre);if(clave.length<2)return;void run(()=>supabase.from('config_formularios').insert({clave,nombre:nuevo.nombre.trim(),modulo:nuevo.modulo.trim()||'General',campos:[]}),'Formulario creado.').then(()=>{setNuevo({nombre:'',modulo:''});setSel(clave);});}}>
    <h3 className="text-xs font-black uppercase text-gray-600">Nuevo formulario</h3>
    <input id="cfg-form-nombre" className={`${input} w-full`} placeholder="Nombre" value={nuevo.nombre} onChange={e=>setNuevo({...nuevo,nombre:e.target.value})}/>
    <input id="cfg-form-modulo" className={`${input} w-full`} placeholder="Módulo" value={nuevo.modulo} onChange={e=>setNuevo({...nuevo,modulo:e.target.value})}/>
    <button className={`${btn} bg-gray-900 text-white inline-flex items-center gap-1`} disabled={busy||slug(nuevo.nombre).length<2}><Plus className="w-3 h-3"/>Crear formulario</button>
   </form>
  </div>
  {form&&<div className={`${card} space-y-4 min-w-0`}>
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0"><h3 className="text-lg font-black text-gray-900">{form.nombre}</h3><p className="text-sm text-gray-500">{form.descripcion||'Sin descripción.'}</p></div>
    <div className="flex gap-2"><button type="button" className={`${btn} border border-gray-200`} disabled={busy} onClick={()=>void run(()=>supabase.from('config_formularios').update({activo:!form.activo}).eq('clave',form.clave),form.activo?'Formulario desactivado.':'Formulario activado.')}>{form.activo?'Desactivar':'Activar'}</button>{!form.uso&&<button type="button" className={`${btn} border border-rose-200 text-rose-600`} disabled={busy} onClick={()=>void quitar('formulario',form.clave)}>Quitar</button>}</div>
   </div>
   <ul className="space-y-2">{campos.map((c,i)=><li key={c.campo+i} className="border border-gray-100 rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] gap-2 items-center">
    <span className="whitespace-nowrap"><button type="button" aria-label="Subir campo" className="p-1 disabled:opacity-30" disabled={i===0} onClick={()=>mover(i,-1)}><ArrowUp className="w-4 h-4"/></button><button type="button" aria-label="Bajar campo" className="p-1 disabled:opacity-30" disabled={i===campos.length-1} onClick={()=>mover(i,1)}><ArrowDown className="w-4 h-4"/></button></span>
    <input aria-label={`Etiqueta de ${c.campo}`} className={`${input} w-full`} disabled={c.bloqueado} value={c.etiqueta} onChange={e=>upd(i,{etiqueta:e.target.value})}/>
    <span className="text-xs text-gray-500">{c.tipo==='lista'?`Lista: ${listas.find(l=>l.clave===c.lista)?.nombre||c.lista}`:c.tipo}</span>
    <label className="text-xs text-gray-600 inline-flex items-center gap-1"><input type="checkbox" disabled={c.bloqueado} checked={!!c.obligatorio} onChange={e=>upd(i,{obligatorio:e.target.checked})}/>Obligatorio</label>
    {c.bloqueado?<Locked title="El sistema usa este campo."/>:<button type="button" className="text-xs font-bold text-rose-600" onClick={()=>setCampos(cs=>cs.filter((_,j)=>j!==i))}>Quitar</button>}
   </li>)}{campos.length===0&&<li className="text-sm text-gray-500">Este formulario no tiene campos. Agrega el primero abajo.</li>}</ul>
   <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 border-t border-gray-100 pt-4">
    <input id="cfg-campo-etiqueta" className={input} placeholder="Etiqueta del campo" value={campo.etiqueta} onChange={e=>setCampo({...campo,etiqueta:e.target.value,campo:slug(e.target.value)})}/>
    <select id="cfg-campo-tipo" className={input} value={campo.tipo} onChange={e=>setCampo({...campo,tipo:e.target.value,lista:e.target.value==='lista'?listas[0]?.clave:undefined})}><option value="texto">Texto</option><option value="numero">Número</option><option value="fecha">Fecha</option><option value="lista">Lista</option><option value="si_no">Sí / No</option></select>
    {campo.tipo==='lista'?<select id="cfg-campo-lista" className={input} value={campo.lista} onChange={e=>setCampo({...campo,lista:e.target.value})}>{listas.filter(l=>l.activo).map(l=><option key={l.clave} value={l.clave}>{l.nombre}</option>)}</select>:<span/>}
    <button type="button" className={`${btn} border border-gray-200 inline-flex items-center gap-1 justify-center`} disabled={campo.campo.length<1||campo.etiqueta.trim().length<2||campos.some(c=>c.campo===campo.campo)} onClick={()=>{setCampos(cs=>[...cs,{...campo,etiqueta:campo.etiqueta.trim()}]);setCampo({campo:'',etiqueta:'',tipo:'texto',obligatorio:false});}}><Plus className="w-3 h-3"/>Agregar campo</button>
   </div>
   <div className="flex justify-end gap-2"><button type="button" className={`${btn} border border-gray-200`} disabled={!dirty} onClick={()=>setCampos(form.campos)}>Descartar</button><button type="button" className={`${btn} bg-rose-500 text-white`} disabled={busy||!dirty} onClick={()=>void run(()=>supabase.from('config_formularios').update({campos}).eq('clave',form.clave),'Formulario guardado.')}>Guardar formulario</button></div>
  </div>}
 </div>;
}

function Historial({hist,names}:{hist:Hist[];names:Record<string,string>}){
 const resumen=(h:Hist)=>{
  if(h.accion!=='editar')return h.accion==='crear'?'Creado':'Eliminado';
  const a=h.anterior||{},n=h.nuevo||{};
  const ch=Object.keys(n).filter(k=>k!=='updated_at'&&JSON.stringify(a[k])!==JSON.stringify(n[k]));
  return ch.map(k=>`${k}: ${JSON.stringify(a[k])??'—'} → ${JSON.stringify(n[k])??'—'}`).join(' · ')||'Sin cambios visibles';
 };
 return <div className={`${card} overflow-x-auto`}><table className="w-full text-sm">
  <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Quién</th><th className="py-2 pr-3">Qué</th><th className="py-2">Cambio</th></tr></thead>
  <tbody>{hist.map(h=><tr key={h.id} className="border-t border-gray-100 align-top">
   <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-xs">{new Date(h.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</td>
   <td className="py-2 pr-3 text-xs">{h.usuario_id?names[h.usuario_id]||'Usuario':'Sistema'}</td>
   <td className="py-2 pr-3 text-xs"><span className="font-bold">{TABLA[h.tabla]||h.tabla}</span><br/><span className="font-mono text-gray-500 break-all">{h.clave}</span></td>
   <td className="py-2 text-xs text-gray-600 break-words">{resumen(h)}</td>
  </tr>)}{hist.length===0&&<tr><td colSpan={4} className="py-4 text-gray-500">Todavía no hay cambios registrados.</td></tr>}</tbody>
 </table></div>;
}
