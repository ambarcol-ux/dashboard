'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {toast} from 'sonner';
import DataAuthorizationAdmin from '@/components/DataAuthorizationAdmin';

type Item={lista:string;valor:string;orden:number;activo:boolean};
type Param={clave:string;modulo:string;etiqueta:string;tipo:'entero'|'booleano';valor:number|boolean;minimo:number|null;maximo:number|null;orden:number;ayuda:string|null};
type Field={formulario:string;campo:string;modulo:string;etiqueta:string;estado:string;orden:number};
type Category={id:number;clasificacion_id:number;nombre:string;precio_hasta:number|null;orden:number;activo:boolean};
type Change={id:number;tabla:string;clave:string;accion:string;antes:Record<string,unknown>|null;despues:Record<string,unknown>|null;created_at:string;usuario_id:string|null};

const LISTS:Record<string,string>={pv_canales:'Primeras visitas · Canales de contacto',pv_resultados_seguimiento:'Primeras visitas · Resultado del seguimiento',pv_motivos_cierre:'Primeras visitas · Motivos de cierre',
 pv_motivos_no_asistencia:'Primeras visitas · Motivos de no asistencia',pv_motivos_eliminar:'Primeras visitas · Motivos para eliminar cita',gastos_categorias:'Finanzas · Categorías de gastos',caja_categorias_ingreso:'Caja · Categorías de ingreso',caja_categorias_egreso:'Caja · Categorías de egreso',accesorios:'Contratos · Accesorios incluidos',banco:'Contratos · Bancos',contrato_medios_pago:'Contratos · Medios de pago',tipos_documento:'Contratos · Tipos de documento',pv_tipos_evento_vitrina:'Primeras visitas · Tipo de evento (vitrina)',pv_como_se_entero:'Primeras visitas · Cómo se enteró',prov_tipos_servicio:'Proveedores · Tipos de servicio',prov_tipos_documento:'Proveedores · Tipos de documento',prov_medios_pago:'Proveedores · Medios de pago',tipo_cuenta:'Contratos · Tipos de cuenta'};
const FORMS:Record<string,string>={resultado_cita:'Resultado de la cita',registro_seguimiento:'Registro de seguimiento',cuenta_contrato:'Cuenta bancaria o llave · Contrato',cuenta_proveedor:'Cuenta bancaria o llave · Proveedores',cuenta_aliado_directo:'Cuenta bancaria o llave · Aliados',cuenta_caja:'Cuenta bancaria o llave · Caja',cuenta_devolucion:'Cuenta bancaria o llave · Depósitos',cuenta_aliados:'Cuenta bancaria o llave · Referidos (programa cerrado)'};
const TABLES:Record<string,string>={listas_contrato:'Lista',config_parametros:'Parámetro',config_formularios:'Formulario',categorias_vestido:'Categoría de vestido'};
const box='bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-3';

/** Configuración (solo Administración): Listas, Parámetros y Formularios reutilizables, con historial. */
export default function ConfigCenter(){
 const [tab,setTab]=useState<'listas'|'parametros'|'formularios'|'categorias'|'autorizaciones'|'historial'>('listas');
 const [cats,setCats]=useState<Category[]>([]),[tipos,setTipos]=useState<{id:number;nombre:string}[]>([]),[newCat,setNewCat]=useState<Record<number,{nombre:string;hasta:string}>>({});
 const [items,setItems]=useState<Item[]>([]),[params,setParams]=useState<Param[]>([]),[fields,setFields]=useState<Field[]>([]),[changes,setChanges]=useState<Change[]>([]);
 const [nuevo,setNuevo]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false);
 const load=useCallback(()=>Promise.all([supabase.from('listas_contrato').select('*').order('lista').order('orden'),supabase.from('config_parametros').select('*').order('modulo').order('orden'),
   supabase.from('config_formularios').select('*').order('formulario').order('orden'),supabase.from('config_historial').select('*').in('tabla',['listas_contrato','config_parametros','config_formularios','categorias_vestido']).order('created_at',{ascending:false}).limit(200),
   supabase.from('categorias_vestido').select('*').order('clasificacion_id').order('precio_hasta',{nullsFirst:false}),supabase.from('clasificaciones_vestido').select('id,nombre').eq('activo',true).order('orden')])
  .then(([l,p,f,h,c,t])=>{setCats((c.data||[]) as Category[]);setTipos((t.data||[]) as {id:number;nombre:string}[]);setItems((l.data||[]) as Item[]);setParams((p.data||[]) as Param[]);setFields((f.data||[]) as Field[]);setChanges((h.data||[]) as Change[]);}),[]);
 useEffect(()=>{void load();},[load]);
 async function run(work:()=>PromiseLike<{error:{message:string}|null}>,ok:string){if(busy)return;setBusy(true);const {error}=await work();setBusy(false);if(error)toast.error(error.message);else{toast.success(ok);void load();}}
 const lists=Array.from(new Set([...Object.keys(LISTS),...items.map(i=>i.lista)]));
 return <div className="space-y-4">
  <div className="flex flex-wrap gap-2">{(['listas','parametros','formularios','categorias','autorizaciones','historial'] as const).map(t=><button key={t} type="button" onClick={()=>setTab(t)}
   className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${tab===t?'bg-rose-500 text-white':'bg-white border border-gray-200 text-gray-600'}`}>{{listas:'Listas',parametros:'Parámetros',formularios:'Formularios',categorias:'Categorías',autorizaciones:'Autorizaciones',historial:'Historial'}[t]}</button>)}</div>

  {tab==='listas'&&lists.map(lista=>{const rows=items.filter(i=>i.lista===lista);return <div key={lista} className={box}>
   <p className="font-black text-gray-900">{LISTS[lista]||lista}</p>
   <ul className="divide-y divide-gray-50">{rows.map(i=><li key={i.valor} className="flex flex-wrap items-center gap-2 py-2 text-sm">
    <span className={i.activo?'text-gray-800':'text-gray-400 line-through'}>{i.valor}</span>
    <button type="button" disabled={busy} className="ml-auto text-xs font-bold text-gray-600" onClick={()=>void run(()=>supabase.from('listas_contrato').update({activo:!i.activo}).eq('lista',lista).eq('valor',i.valor),i.activo?'Desactivado.':'Activado.')}>{i.activo?'Desactivar':'Activar'}</button>
    <button type="button" disabled={busy} className="text-xs font-bold text-rose-600" onClick={()=>{if(window.confirm(`¿Eliminar «${i.valor}»? Si ya se usó, solo se puede desactivar.`))void run(()=>supabase.from('listas_contrato').delete().eq('lista',lista).eq('valor',i.valor),'Eliminado.');}}>Eliminar</button></li>)}</ul>
   <form className="flex gap-2" onSubmit={e=>{e.preventDefault();const v=(nuevo[lista]||'').trim();if(!v)return;void run(()=>supabase.from('listas_contrato').insert({lista,valor:v,orden:(rows.at(-1)?.orden||0)+1,activo:true}),'Agregado.').then(()=>setNuevo(n=>({...n,[lista]:''})));}}>
    <input value={nuevo[lista]||''} maxLength={80} onChange={e=>setNuevo(n=>({...n,[lista]:e.target.value}))} placeholder="Nuevo valor" className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"/>
    <button disabled={busy} className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-black uppercase">Agregar</button></form>
  </div>;})}

  {tab==='parametros'&&<div className={box}>{params.map(p=><div key={p.clave} className="flex flex-wrap items-center gap-3 py-2 border-b border-gray-50 text-sm">
   <span className="flex-1 min-w-[220px]"><b className="text-gray-800">{p.etiqueta}</b>{p.minimo!=null&&<span className="text-gray-400"> ({p.minimo}–{p.maximo})</span>}{p.ayuda&&<br/>}{p.ayuda&&<span className="text-xs text-gray-400">{p.ayuda}</span>}</span>
   {p.tipo==='booleano'?<select value={p.valor?'si':'no'} disabled={busy} onChange={e=>void run(()=>supabase.from('config_parametros').update({valor:e.target.value==='si'}).eq('clave',p.clave),'Parámetro guardado.')} className="px-3 py-2 border border-gray-200 rounded-xl"><option value="si">Sí</option><option value="no">No</option></select>
    :<input type="number" defaultValue={Number(p.valor)} min={p.minimo??undefined} max={p.maximo??undefined} disabled={busy} className="w-24 px-3 py-2 border border-gray-200 rounded-xl"
      onBlur={e=>{const v=Number(e.target.value);if(v!==Number(p.valor))void run(()=>supabase.from('config_parametros').update({valor:v}).eq('clave',p.clave),'Parámetro guardado.');}}/>}
  </div>)}</div>}

  {tab==='formularios'&&Array.from(new Set(fields.map(f=>f.formulario))).map(form=><div key={form} className={box}>
   <p className="font-black text-gray-900">{FORMS[form]||form}</p>
   {fields.filter(f=>f.formulario===form).map(f=><div key={f.campo} className="flex items-center gap-3 py-2 border-b border-gray-50 text-sm"><span className="flex-1">{f.etiqueta}</span>
    {f.estado==='bloqueado'?<span className="px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-bold">Bloqueado</span>
     :<select value={f.estado} disabled={busy} className="px-3 py-2 border border-gray-200 rounded-xl" onChange={e=>void run(()=>supabase.from('config_formularios').update({estado:e.target.value}).eq('formulario',f.formulario).eq('campo',f.campo),'Formulario guardado.')}>
      <option value="obligatorio">Obligatorio</option><option value="opcional">Opcional</option>{f.modulo!=='cuentas_bancarias'&&<option value="oculto">Oculto</option>}</select>}</div>)}
  </div>)}

  {tab==='categorias'&&<><p className="text-xs text-gray-500">La categoría de cada vestido se asigna sola por tipo y precio de alquiler: la primera cuyo tope cubre el precio (sin tope = el resto). Al guardar se recalculan todos los vestidos.</p>
   {tipos.map(t=>{const rows=cats.filter(c=>c.clasificacion_id===t.id),n=newCat[t.id]||{nombre:'',hasta:''};return <div key={t.id} className={box}>
   <p className="font-black text-gray-900">{t.nombre}</p>
   {rows.map(c=><div key={c.id} className="flex flex-wrap items-center gap-2 py-2 border-b border-gray-50 text-sm">
    <input defaultValue={c.nombre} disabled={busy} className="flex-1 min-w-[140px] px-3 py-2 border border-gray-200 rounded-xl" onBlur={e=>{const v=e.target.value.trim();if(v&&v!==c.nombre)void run(()=>supabase.from('categorias_vestido').update({nombre:v}).eq('id',c.id),'Categoría guardada; vestidos recalculados.');}}/>
    <label className="text-xs text-gray-500">Hasta $<input type="number" min={1} defaultValue={c.precio_hasta??''} placeholder="sin tope" disabled={busy} className="ml-1 w-32 px-3 py-2 border border-gray-200 rounded-xl"
     onBlur={e=>{const v=e.target.value===''?null:Number(e.target.value);if(v!==c.precio_hasta)void run(()=>supabase.from('categorias_vestido').update({precio_hasta:v}).eq('id',c.id),'Categoría guardada; vestidos recalculados.');}}/></label>
    <button type="button" disabled={busy} className="text-xs font-bold text-gray-600" onClick={()=>void run(()=>supabase.from('categorias_vestido').update({activo:!c.activo}).eq('id',c.id),c.activo?'Desactivada; vestidos recalculados.':'Activada; vestidos recalculados.')}>{c.activo?'Desactivar':'Activar'}</button>
    <button type="button" disabled={busy} className="text-xs font-bold text-rose-600" onClick={()=>{if(window.confirm(`¿Eliminar «${c.nombre}»? Si ya se usó, solo se puede desactivar.`))void run(()=>supabase.from('categorias_vestido').delete().eq('id',c.id),'Eliminada; vestidos recalculados.');}}>Eliminar</button></div>)}
   <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();if(!n.nombre.trim())return;void run(()=>supabase.from('categorias_vestido').insert({clasificacion_id:t.id,nombre:n.nombre.trim(),precio_hasta:n.hasta?Number(n.hasta):null,orden:rows.length+1}),'Categoría agregada; vestidos recalculados.').then(()=>setNewCat(x=>({...x,[t.id]:{nombre:'',hasta:''}})));}}>
    <input value={n.nombre} maxLength={40} onChange={e=>setNewCat(x=>({...x,[t.id]:{...n,nombre:e.target.value}}))} placeholder="Nueva categoría" className="flex-1 min-w-[140px] px-3 py-2 border border-gray-200 rounded-xl text-sm"/>
    <input type="number" min={1} value={n.hasta} onChange={e=>setNewCat(x=>({...x,[t.id]:{...n,hasta:e.target.value}}))} placeholder="Hasta $ (vacío = sin tope)" className="w-48 px-3 py-2 border border-gray-200 rounded-xl text-sm"/>
    <button disabled={busy} className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-black uppercase">Agregar</button></form>
  </div>;})}</>}

  {tab==='autorizaciones'&&<DataAuthorizationAdmin canEditTexts/>}
  {tab==='historial'&&<div className={box}>{changes.map(c=>{const a=c.antes||{},d=c.despues||{},keys=Object.keys({...a,...d}).filter(k=>JSON.stringify(a[k])!==JSON.stringify(d[k]));
   return <p key={c.id} className="text-sm border-b border-gray-50 py-2"><b>{new Date(c.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</b> · {TABLES[c.tabla]||c.tabla} · {c.clave} · {c.accion==='insert'?'creado':c.accion==='delete'?'eliminado':keys.map(k=>`${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(d[k])}`).join(', ')}</p>;})}
   {!changes.length&&<p className="text-sm text-gray-400">Sin cambios.</p>}</div>}
 </div>;
}
