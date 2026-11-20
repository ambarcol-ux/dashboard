'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

/** Cierres de caja › egreso › «Siigo»: the purchase or expense paid from the store, as in Siigo — «Compra o gasto» (supplier's electronic
 *  invoice) or «Documento soporte» (cuenta de cobro), lines of PRODUCTO (Siigo product, raises stock) or GASTO (any ledger account of
 *  the company), taxes and the company's purchase payment method. Queued with siigo_registrar_compra; the worker sends it (lib/siigo.ts). */
type Forma={id:number;name:string};
type Impuesto={id:number;name:string;type:string;percentage:number};
type Linea={tipo:'Account'|'Product';codigo:string;nombre:string;cantidad:string;valor:string;iva:string;ret:string};
type Opcion={codigo:string;nombre:string;categoria?:string|null};
const nueva=():Linea=>({tipo:'Account',codigo:'',nombre:'',cantidad:'1',valor:'',iva:'',ret:''});
const cop=(n:number)=>`$${Math.round(n).toLocaleString('es-CO')}`;
// Withholding of ReteICA is per thousand in Siigo's list («ReteICA 4.14»); ReteIVA applies on the VAT; the rest are percentages of the base.
const efecto=(t:Impuesto|undefined,base:number,iva:number)=>!t?0:t.type==='IVA'||t.type==='Impoconsumo'?base*t.percentage/100:t.type==='ReteIVA'?-iva*t.percentage/100:t.type==='ReteICA'?-base*t.percentage/1000:-base*t.percentage/100;

export default function SiigoCompra({movimiento,onClose,onDone}:{movimiento:{id:string;sede_id:string;valor:number;descripcion?:string|null;categoria?:string|null};onClose:()=>void;onDone:(m:string)=>void}){
 const [listas,setListas]=useState<{formas_fc:Forma[];formas_ds:Forma[];impuestos:Impuesto[];cuentas:number}|null|undefined>(undefined);
 const [comp,setComp]=useState<'FC'|'DS'>('FC'),[nit,setNit]=useState(''),[nombre,setNombre]=useState(''),[factura,setFactura]=useState(''),[forma,setForma]=useState('');
 const [lineas,setLineas]=useState<Linea[]>([{...nueva(),valor:String(movimiento.valor||'')}]),[buscar,setBuscar]=useState<{i:number;q:string}|null>(null),[opciones,setOpciones]=useState<Opcion[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{void supabase.rpc('siigo_compra_listas',{p_sede:movimiento.sede_id}).then(({data})=>setListas((data||null) as typeof listas));},[movimiento.sede_id]);
 useEffect(()=>{if(!buscar||buscar.q.trim().length<2){const t=setTimeout(()=>setOpciones([]),0);return()=>clearTimeout(t);}
  const tipo=lineas[buscar.i]?.tipo==='Product'?'producto':'cuenta';
  const t=setTimeout(()=>{void supabase.rpc('siigo_buscar',{p_sede:movimiento.sede_id,p_tipo:tipo,p_q:buscar.q}).then(({data})=>setOpciones(((data||[]) as Record<string,string>[]).map(x=>tipo==='cuenta'?{codigo:x.codigo,nombre:x.nombre,categoria:x.categoria}:{codigo:x.code,nombre:x.name})));},250);
  return()=>clearTimeout(t);},[buscar,lineas,movimiento.sede_id]);
 const imp=listas?.impuestos||[],ivas=imp.filter(t=>t.type==='IVA'||t.type==='Impoconsumo'),rets=imp.filter(t=>t.type!=='IVA'&&t.type!=='Impoconsumo');
 const total=lineas.reduce((s,l)=>{const base=Number(l.cantidad||0)*Number(l.valor||0),ti=imp.find(t=>String(t.id)===l.iva),tr=imp.find(t=>String(t.id)===l.ret),iva=efecto(ti,base,0);return s+base+iva+efecto(tr,base,iva);},0);
 const set=(i:number,v:Partial<Linea>)=>setLineas(ls=>ls.map((l,j)=>j===i?{...l,...v}:l));
 const formas=(comp==='FC'?listas?.formas_fc:listas?.formas_ds)||[];
 const enviar=async()=>{setError('');
  if(Math.abs(total-Number(movimiento.valor))>1&&!confirm(`El total calculado (${cop(total)}) no es igual al egreso (${cop(Number(movimiento.valor))}). Siigo puede rechazarlo. ¿Enviar igual?`))return;
  setBusy(true);
  const items=lineas.map(l=>({tipo:l.tipo,codigo:l.codigo,descripcion:(l.nombre||movimiento.descripcion||movimiento.categoria||'Gasto').slice(0,300),cantidad:Number(l.cantidad),valor:Number(l.valor),impuestos:[l.iva,l.ret].filter(Boolean).map(Number)}));
  const {error:e}=await supabase.rpc('siigo_registrar_compra',{p_movimiento:movimiento.id,p:{comprobante:comp,proveedor:{documento:nit,nombre},factura_numero:factura,forma_pago:Number(forma),items,total:Number(movimiento.valor)}});
  setBusy(false);if(e)setError(e.message);else{onDone('Compra o gasto registrado: llega a Siigo en unos minutos.');onClose();}};
 const input='w-full mt-1 border rounded-lg p-2 text-sm',lab='block text-xs font-bold text-gray-600';
 return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={onClose}><div className="bg-white rounded-2xl p-5 w-full max-w-2xl max-h-[92vh] overflow-y-auto space-y-3" onClick={e=>e.stopPropagation()}>
  <h3 className="font-black text-lg">Registrar en Siigo · {cop(Number(movimiento.valor))}</h3>
  {listas===undefined?<p className="text-sm text-gray-500">Cargando listas de Siigo…</p>:listas===null?<p className="text-sm font-bold text-rose-700">Esta sede no tiene Siigo activo.</p>:<>
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
      {buscar?.i===i&&opciones.length>0&&<div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded-lg shadow max-h-56 overflow-y-auto">{opciones.map(o=>
       <button key={o.codigo} type="button" onClick={()=>{set(i,{codigo:o.codigo,nombre:o.nombre});setBuscar(null);setOpciones([]);}} className="block w-full text-left px-3 py-2 text-xs hover:bg-indigo-50"><b>{o.codigo}</b> · {o.nombre}{o.categoria?<span className="text-gray-400"> · {o.categoria}</span>:null}</button>)}</div>}
     </label>
     {lineas.length>1&&<button type="button" onClick={()=>setLineas(ls=>ls.filter((_,j)=>j!==i))} className="text-xs font-black text-rose-700 px-2 py-2">Quitar</button>}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
     <label className={lab}>Cantidad<input className={input} type="number" min="0" value={l.cantidad} onChange={e=>set(i,{cantidad:e.target.value})}/></label>
     <label className={lab}>Valor unitario (antes de impuestos)<input className={input} type="number" min="0" value={l.valor} onChange={e=>set(i,{valor:e.target.value})}/></label>
     <label className={lab}>IVA<select className={input} value={l.iva} onChange={e=>set(i,{iva:e.target.value})}><option value="">Sin IVA</option>{ivas.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
     <label className={lab}>Retención<select className={input} value={l.ret} onChange={e=>set(i,{ret:e.target.value})}><option value="">Sin retención</option>{rets.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    </div></div>)}
    <button type="button" onClick={()=>setLineas(ls=>[...ls,nueva()])} className="text-xs font-black text-indigo-700">+ Agregar renglón</button>
   </div>
   <label className={lab}>Forma de pago (Siigo)<select className={input} value={forma} onChange={e=>setForma(e.target.value)}><option value="">Elige cómo se pagó</option>{formas.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
   {!formas.length&&<p className="text-xs font-bold text-amber-700">Siigo no tiene formas de pago habilitadas para este comprobante en esta sede.</p>}
   <p className={`text-sm font-black ${Math.abs(total-Number(movimiento.valor))>1?'text-amber-700':'text-emerald-700'}`}>Total calculado {cop(total)} · egreso de caja {cop(Number(movimiento.valor))}</p>
   {error&&<p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
   <div className="flex gap-2"><button type="button" disabled={busy||!forma||lineas.some(l=>!l.codigo||!Number(l.valor))} onClick={()=>void enviar()} className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50">{busy?'Guardando…':'Registrar en Siigo'}</button>
    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-black">Cancelar</button></div>
  </>}
 </div></div>;
}
