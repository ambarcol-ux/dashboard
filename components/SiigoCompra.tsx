'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

/** Cierres de caja › egreso › «Siigo»: the purchase or expense paid from the store, as in Siigo — «Compra o gasto» (supplier's electronic
 *  invoice) or «Documento soporte» (cuenta de cobro), lines of PRODUCTO (Siigo product, raises stock) or GASTO (any ledger account of
 *  the company), taxes and the company's purchase payment method. Queued with siigo_registrar_compra; the worker sends it (lib/siigo.ts). */
type Forma={id:number;name:string};
type Impuesto={id:number;name:string;type:string;percentage:number};
type Linea={tipo:'Account'|'Product';codigo:string;nombre:string;cantidad:string;valor:string;iva:string;ret:string;imp?:number[]};
type Opcion={codigo:string;nombre:string;categoria?:string|null};
const nueva=():Linea=>({tipo:'Account',codigo:'',nombre:'',cantidad:'1',valor:'',iva:'',ret:''});
const cop=(n:number)=>`$${Math.round(n).toLocaleString('es-CO')}`;
// Withholding of ReteICA is per thousand in Siigo's list («ReteICA 4.14»); ReteIVA applies on the VAT; the rest are percentages of the base.
const efecto=(t:Impuesto|undefined,base:number,iva:number)=>!t?0:t.type==='IVA'||t.type==='Impoconsumo'?base*t.percentage/100:t.type==='ReteIVA'?-iva*t.percentage/100:t.type==='ReteICA'?-base*t.percentage/1000:-base*t.percentage/100;

type Guardado={comprobante?:string;proveedor?:{documento?:string;nombre?:string};factura_numero?:string|null;forma_pago?:number;items?:{tipo:'Account'|'Product';codigo:string;descripcion?:string;cantidad?:number;valor?:number;impuestos?:number[]}[]};
type Listas={formas_fc:Forma[];formas_ds:Forma[];impuestos:Impuesto[];cuentas:number;grupos?:{categoria:string;n:number}[];sugeridas?:Record<string,{codigo:string;nombre:string}>};

/** origen «caja»: a cash-register outflow, sent when the day's cash register is closed. «proveedor»: Proveedores › Pagos (store chosen here,
 *  sent right away). «existente»: what was saved before, to correct it while it is not in Siigo. */
export default function SiigoCompra({movimiento,onClose,onDone,origen='caja',sedes,proveedor,existente}:{movimiento:{id:string;sede_id:string;valor:number;descripcion?:string|null;categoria?:string|null};onClose:()=>void;onDone:(m:string)=>void;
 origen?:'caja'|'proveedor';sedes?:{id:string;nombre:string}[];proveedor?:{documento?:string|null;nombre?:string|null};existente?:Guardado|null}){
 const [sede,setSede]=useState(movimiento.sede_id);
 const [listas,setListas]=useState<Listas|null|undefined>(undefined);
 const [comp,setComp]=useState<'FC'|'DS'>(existente?.comprobante==='DS'?'DS':'FC'),[nit,setNit]=useState(existente?.proveedor?.documento||proveedor?.documento||''),[nombre,setNombre]=useState(existente?.proveedor?.nombre||proveedor?.nombre||''),[factura,setFactura]=useState(existente?.factura_numero||''),[forma,setForma]=useState(existente?.forma_pago?String(existente.forma_pago):'');
 const [lineas,setLineas]=useState<Linea[]>(()=>existente?.items?.length?existente.items.map(it=>({tipo:it.tipo,codigo:it.codigo,nombre:it.descripcion||'',cantidad:String(it.cantidad||1),valor:String(it.valor||''),iva:'',ret:'',imp:it.impuestos||[]})):[{...nueva(),valor:String(movimiento.valor||'')}]),[buscar,setBuscar]=useState<{i:number;q:string}|null>(null),[opciones,setOpciones]=useState<Opcion[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ver,setVer]=useState<{i:number;grupo:string;q:string;filas:Opcion[]}|null>(null);
 useEffect(()=>{if(!sede)return;let live=true;void supabase.rpc('siigo_compra_listas',{p_sede:sede}).then(({data})=>{if(!live)return;const l=(data||null) as Listas|null;setListas(l);if(!l)return;
  // Saved taxes go back to their IVA / retention box; a new expense gets the account last used for its kind in this store.
  setLineas(ls=>ls.map((x,i)=>{const imp=(x.imp||[]).map(String),iva=imp.find(id=>l.impuestos.some(t=>String(t.id)===id&&(t.type==='IVA'||t.type==='Impoconsumo')))||'',ret=imp.find(id=>id!==iva)||'';
   const sug=i===0&&!x.codigo&&x.tipo==='Account'?l.sugeridas?.[String(movimiento.categoria||'').toLowerCase()]:undefined;
   return {...x,iva:x.iva||iva,ret:x.ret||ret,imp:undefined,...(sug?{codigo:sug.codigo,nombre:sug.nombre}:{})};}));});return()=>{live=false;};},[sede,movimiento.categoria]);
 useEffect(()=>{if(!ver)return;const t=setTimeout(()=>{void supabase.rpc('siigo_cuentas_explorar',{p_sede:sede,p_categoria:ver.grupo||null,p_q:ver.q}).then(({data})=>setVer(v=>v?{...v,filas:((data||[]) as Opcion[])}:v));},250);return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ver?.grupo,ver?.q,sede]);
 useEffect(()=>{if(!buscar||buscar.q.trim().length<2){const t=setTimeout(()=>setOpciones([]),0);return()=>clearTimeout(t);}
  const tipo=lineas[buscar.i]?.tipo==='Product'?'producto':'cuenta';
  const t=setTimeout(()=>{void supabase.rpc('siigo_buscar',{p_sede:sede,p_tipo:tipo,p_q:buscar.q}).then(({data})=>setOpciones(((data||[]) as Record<string,string>[]).map(x=>tipo==='cuenta'?{codigo:x.codigo,nombre:x.nombre,categoria:x.categoria}:{codigo:x.code,nombre:x.name})));},250);
  return()=>clearTimeout(t);},[buscar,lineas,sede]);
 const imp=listas?.impuestos||[],ivas=imp.filter(t=>t.type==='IVA'||t.type==='Impoconsumo'),rets=imp.filter(t=>t.type!=='IVA'&&t.type!=='Impoconsumo');
 const total=lineas.reduce((s,l)=>{const base=Number(l.cantidad||0)*Number(l.valor||0),ti=imp.find(t=>String(t.id)===l.iva),tr=imp.find(t=>String(t.id)===l.ret),iva=efecto(ti,base,0);return s+base+iva+efecto(tr,base,iva);},0);
 const set=(i:number,v:Partial<Linea>)=>setLineas(ls=>ls.map((l,j)=>j===i?{...l,...v}:l));
 const formas=(comp==='FC'?listas?.formas_fc:listas?.formas_ds)||[];
 const enviar=async()=>{setError('');
  if(Math.abs(total-Number(movimiento.valor))>1&&!confirm(`El total calculado (${cop(total)}) no es igual al egreso (${cop(Number(movimiento.valor))}). Siigo puede rechazarlo. ¿Enviar igual?`))return;
  setBusy(true);
  const items=lineas.map(l=>({tipo:l.tipo,codigo:l.codigo,descripcion:(l.nombre||movimiento.descripcion||movimiento.categoria||'Gasto').slice(0,300),cantidad:Number(l.cantidad),valor:Number(l.valor),impuestos:[l.iva,l.ret].filter(Boolean).map(Number)}));
  const p={comprobante:comp,proveedor:{documento:nit,nombre},factura_numero:factura,forma_pago:Number(forma),items,total:Number(movimiento.valor)};
  const {error:e}=origen==='proveedor'?await supabase.rpc('siigo_registrar_compra_proveedor',{p_pago:movimiento.id,p_sede:sede,p}):await supabase.rpc('siigo_registrar_compra',{p_movimiento:movimiento.id,p});
  setBusy(false);if(e)setError(e.message);else{onDone(origen==='proveedor'?'Guardado con su cuenta contable: llega a Siigo en unos minutos.':'Guardado con su cuenta contable: se envía a Siigo cuando se cierre la caja del día (hasta entonces se puede corregir).');onClose();}};
 const input='w-full mt-1 border rounded-lg p-2 text-sm',lab='block text-xs font-bold text-gray-600';
 return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={onClose}><div className="bg-white rounded-2xl p-5 w-full max-w-2xl max-h-[92vh] overflow-y-auto space-y-3" onClick={e=>e.stopPropagation()}>
  <h3 className="font-black text-lg">{existente?'Corregir antes de Siigo':'Registrar en Siigo'} · {cop(Number(movimiento.valor))}</h3>
  {origen==='proveedor'&&sedes&&<label className="block text-xs font-bold text-gray-600">Sede (empresa en Siigo)<select className="w-full mt-1 border rounded-lg p-2 text-sm" value={sede} onChange={e=>{setSede(e.target.value);setListas(undefined);setForma('');}}><option value="">Elige la sede</option>{sedes.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>}
  {!sede?<p className="text-sm text-gray-500">Elige la sede para ver sus cuentas y formas de pago.</p>:listas===undefined?<p className="text-sm text-gray-500">Cargando listas de Siigo…</p>:listas===null?<p className="text-sm font-bold text-rose-700">Esta sede no tiene Siigo activo.</p>:<>
   {!listas.cuentas&&<p className="text-xs font-bold text-amber-700">Falta cargar el catálogo de cuentas de esta sede (Configuración › Facturación por sede).</p>}
   <div className="grid grid-cols-2 gap-2">{([['FC','Compra o gasto','El proveedor entregó factura electrónica'],['DS','Documento soporte','Cuenta de cobro o documento no electrónico']] as const).map(([v,t,d])=>
    <button key={v} type="button" onClick={()=>{setComp(v);setForma('');}} className={`text-left rounded-xl border p-3 ${comp===v?'border-indigo-600 bg-indigo-50':''}`}><b className="text-sm">{t}</b><span className="block text-xs text-gray-500">{d}</span></button>)}</div>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
    <label className={lab}>NIT o cédula del proveedor<input className={input} inputMode="numeric" value={nit} onChange={e=>setNit(e.target.value)}/></label>
    <label className={lab}>Nombre del proveedor<input className={input} value={nombre} onChange={e=>setNombre(e.target.value)}/></label>
    {comp==='FC'&&<label className={lab}>N.º factura electrónica<input className={input} value={factura} onChange={e=>setFactura(e.target.value)} placeholder="Ej.: FE-1234"/></label>}
   </div>
   <div className="space-y-2">{lineas.map((l,i)=><div key={i} className="border rounded-xl p-3 space-y-2">
    <div className="flex flex-wrap gap-2 items-end">
     <div className="flex rounded-lg border overflow-hidden text-xs font-black">{([['Account','GASTO'],['Product','PRODUCTO']] as const).map(([v,t])=><button key={v} type="button" onClick={()=>set(i,{tipo:v,codigo:'',nombre:''})} className={`px-3 py-2 ${l.tipo===v?'bg-gray-900 text-white':''}`}>{t}</button>)}</div>
     <label className={`${lab} flex-1 min-w-[180px] relative`}>{l.tipo==='Account'?'Cuenta contable (escribe, ej.: papelería)':'Producto de Siigo (código o nombre)'}
      <input className={input} value={buscar?.i===i?buscar.q:l.codigo?`${l.codigo} · ${l.nombre}`:''} onFocus={()=>setBuscar({i,q:''})} onChange={e=>setBuscar({i,q:e.target.value})}/>
      {buscar?.i===i&&l.tipo==='Account'&&/^\d{6,10}$/.test(buscar.q.trim())&&!opciones.some(o=>o.codigo===buscar.q.trim())&&<button type="button" onClick={()=>{set(i,{codigo:buscar.q.trim(),nombre:'Cuenta no listada (Siigo la valida al enviar)'});setBuscar(null);}} className="block w-full text-left px-3 py-2 text-xs bg-amber-50 border rounded-lg mt-1">Usar la cuenta <b>{buscar.q.trim()}</b>: no está en el catálogo; Siigo la valida al enviar y se agrega sola.</button>}
      {buscar?.i===i&&opciones.length>0&&<div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded-lg shadow max-h-56 overflow-y-auto">{opciones.map(o=>
       <button key={o.codigo} type="button" onClick={()=>{set(i,{codigo:o.codigo,nombre:o.nombre});setBuscar(null);setOpciones([]);}} className="block w-full text-left px-3 py-2 text-xs hover:bg-indigo-50"><b>{o.codigo}</b> · {o.nombre}{o.categoria?<span className="text-gray-400"> · {o.categoria}</span>:null}</button>)}</div>}
     </label>
     {l.tipo==='Account'&&<button type="button" onClick={()=>setVer({i,grupo:listas.grupos?.[0]?.categoria||'',q:'',filas:[]})} className="text-xs font-black text-indigo-700 px-2 py-2">Ver todas</button>}
     {lineas.length>1&&<button type="button" onClick={()=>setLineas(ls=>ls.filter((_,j)=>j!==i))} className="text-xs font-black text-rose-700 px-2 py-2">Quitar</button>}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
     <label className={lab}>Cantidad<input className={input} type="number" min="0" value={l.cantidad} onChange={e=>set(i,{cantidad:e.target.value})}/></label>
     <label className={lab}>Valor unitario (antes de impuestos)<input className={input} type="number" min="0" value={l.valor} onChange={e=>set(i,{valor:e.target.value})}/></label>
     <label className={lab}>IVA<select className={input} value={l.iva} onChange={e=>set(i,{iva:e.target.value})}><option value="">Sin IVA</option>{ivas.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
     <label className={lab}>Retención<select className={input} value={l.ret} onChange={e=>set(i,{ret:e.target.value})}><option value="">Sin retención</option>{rets.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    </div></div>)}
    <button type="button" onClick={()=>setLineas(ls=>[...ls,nueva()])} className="text-xs font-black text-indigo-700">+ Agregar renglón</button>
    {ver&&<div className="border rounded-xl p-3 space-y-2 bg-gray-50"><div className="flex flex-wrap gap-2 items-end">
     <label className={`${lab} flex-1`}>Grupo de cuentas<select className={input} value={ver.grupo} onChange={e=>setVer({...ver,grupo:e.target.value})}><option value="">Todos</option>{(listas.grupos||[]).map(g=><option key={g.categoria} value={g.categoria}>{g.categoria} ({g.n})</option>)}</select></label>
     <label className={`${lab} flex-1`}>Filtrar<input className={input} value={ver.q} placeholder="Nombre o código" onChange={e=>setVer({...ver,q:e.target.value})}/></label>
     <button type="button" onClick={()=>setVer(null)} className="text-xs font-black px-2 py-2">Cerrar</button></div>
     <div className="max-h-64 overflow-y-auto bg-white border rounded-lg">{ver.filas.map(o=><button key={o.codigo} type="button" onClick={()=>{set(ver.i,{codigo:o.codigo,nombre:o.nombre});setVer(null);}} className="block w-full text-left px-3 py-2 text-xs hover:bg-indigo-50"><b>{o.codigo}</b> · {o.nombre}<span className="text-gray-400"> · {o.categoria}</span></button>)}
      {!ver.filas.length&&<p className="text-xs text-gray-500 p-3">Sin cuentas con ese filtro.</p>}</div></div>}
   </div>
   <label className={lab}>Forma de pago (Siigo)<select className={input} value={forma} onChange={e=>setForma(e.target.value)}><option value="">Elige cómo se pagó</option>{formas.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
   {!formas.length&&<p className="text-xs font-bold text-amber-700">Siigo no tiene formas de pago habilitadas para este comprobante en esta sede.</p>}
   {origen==='caja'&&<p className="text-xs text-gray-500">Se envía a Siigo cuando se cierre la caja del día; hasta entonces se puede corregir.</p>}
   <p className={`text-sm font-black ${Math.abs(total-Number(movimiento.valor))>1?'text-amber-700':'text-emerald-700'}`}>Total calculado {cop(total)} · egreso de caja {cop(Number(movimiento.valor))}</p>
   {error&&<p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
   <div className="flex gap-2"><button type="button" disabled={busy||!forma||lineas.some(l=>!l.codigo||!Number(l.valor))} onClick={()=>void enviar()} className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50">{busy?'Guardando…':origen==='proveedor'?'Guardar y enviar a Siigo':'Guardar para Siigo'}</button>
    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-black">Cancelar</button></div>
  </>}
 </div></div>;
}
