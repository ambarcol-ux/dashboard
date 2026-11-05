'use client';
import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';
import {accountLabel,accountsFor,CASH_METHODS,needsAccount,type CashAccount} from '@/lib/cash';

type SaleDress={id:string|number;codigo:string;nombre?:string|null;precio_venta?:number|null;sede_actual_id?:string|null};
const money=(n:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
const digits=(v:string)=>v.replace(/\D/g,'');

/** Sale of a dress (cash sale, no contract): sale price minus an optional discount with reason, buyer data for the invoice.
 * The income goes into today's cash register as «Venta de vestido»; Siigo will use the code + V. */
export default function DressSaleDialog({dress,onClose,onSaved}:{dress:SaleDress;onClose:()=>void;onSaved:(ventaId?:string)=>void}){
 const precio=Number(dress.precio_venta)||0;
 const [f,setF]=useState({descuento:'',motivo_descuento:'',medio_pago:'Efectivo',cuenta_id:'',cliente_nombre:'',cliente_documento:'',cliente_telefono:'',cliente_email:'',numero_factura:''}),[busy,setBusy]=useState(false);
 const [cuentas,setCuentas]=useState<CashAccount[]>([]);
 useEffect(()=>{let live=true;void supabase.rpc('cuentas_dinero_lista').then(({data})=>{if(live)setCuentas((data||[]) as CashAccount[]);});return()=>{live=false;};},[]);
 const dto=Number(f.descuento)||0,total=Math.max(0,precio-dto);
 const opciones=accountsFor(f.medio_pago,cuentas,String(dress.sede_actual_id||''));
 const faltaCuenta=needsAccount(f.medio_pago,opciones)&&!f.cuenta_id;
 const invalido=!precio||dto>=precio||(dto>0&&f.motivo_descuento.trim().length<5)||f.cliente_nombre.trim().length<3||!/^[0-9A-Za-z-]{5,20}$/.test(f.cliente_documento.replace(/[\s.]/g,''))||faltaCuenta;
 const save=async()=>{setBusy(true);
  const {data,error}=await supabase.rpc('registrar_venta_vestido',{p_datos:{vestido_id:dress.id,...f,descuento:String(dto)}});
  setBusy(false);
  if(error){toast.error(error.message);return;}
  toast.success(`Venta registrada: ${dress.codigo} por ${money(total)}. Entró a la caja de hoy.`);onSaved(data?String(data):undefined);};
 const input='w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none';
 const label='block text-[10px] font-black text-gray-400 uppercase tracking-widest';
 return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={()=>{if(!busy)onClose();}}>
  <div className="bg-white rounded-3xl w-full max-w-lg p-8 space-y-4 max-h-[92vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
   <h2 className="text-xl font-black text-gray-900 uppercase">Vender vestido {dress.codigo}</h2>
   <p className="text-sm text-gray-500">{dress.nombre} · Precio de venta <b>{precio?money(precio):'sin precio'}</b>. Venta de contado: entra a la caja de hoy y queda para facturar en Siigo con el código <b>{String(dress.codigo).trim().toUpperCase()}V</b>.</p>
   {!precio&&<p className="text-sm font-bold text-rose-600">Este vestido no tiene precio de venta. Edítalo y escríbelo antes de vender.</p>}
   <div className="grid grid-cols-2 gap-4">
    <label className={label}>Descuento (opcional)<input className={input} inputMode="numeric" value={f.descuento?Number(f.descuento).toLocaleString('es-CO'):''} onChange={e=>setF({...f,descuento:digits(e.target.value)})} placeholder="0"/></label>
    <div className={label}>Total a cobrar<p className="mt-1 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 text-lg font-black">{money(total)}</p></div>
   </div>
   {dto>0&&<label className={label}>Motivo del descuento *<input className={input} maxLength={500} value={f.motivo_descuento} onChange={e=>setF({...f,motivo_descuento:e.target.value})}/></label>}
   <div className="grid grid-cols-2 gap-4">
    <label className={label}>Medio de pago<select className={input} value={f.medio_pago} onChange={e=>setF({...f,medio_pago:e.target.value,cuenta_id:''})}>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
    {opciones.length>0&&f.medio_pago!=='Efectivo'&&<label className={label}>Cuenta que recibió *<select className={input} value={f.cuenta_id} onChange={e=>setF({...f,cuenta_id:e.target.value})}><option value="">Elige…</option>{opciones.map(c=><option key={c.id} value={c.id}>{accountLabel(c)}</option>)}</select></label>}
   </div>
   <p className="text-xs font-black text-gray-500 uppercase tracking-widest pt-2">Datos para la factura</p>
   <label className={label}>Nombre de quien compra *<input className={input} maxLength={140} value={f.cliente_nombre} onChange={e=>setF({...f,cliente_nombre:e.target.value})}/></label>
   <div className="grid grid-cols-2 gap-4">
    <label className={label}>Cédula o NIT *<input className={input} maxLength={20} value={f.cliente_documento} onChange={e=>setF({...f,cliente_documento:e.target.value.replace(/[^0-9A-Za-z-]/g,'')})}/></label>
    <label className={label}>Teléfono<input className={input} inputMode="tel" maxLength={20} value={f.cliente_telefono} onChange={e=>setF({...f,cliente_telefono:e.target.value})}/></label>
    <label className={label}>Correo<input className={input} type="email" maxLength={160} value={f.cliente_email} onChange={e=>setF({...f,cliente_email:e.target.value})}/></label>
    <label className={label}>N° de factura (si ya existe)<input className={input} maxLength={40} value={f.numero_factura} onChange={e=>setF({...f,numero_factura:e.target.value})}/></label>
   </div>
   <div className="flex gap-3 justify-end pt-2"><button onClick={onClose} disabled={busy} className="px-5 py-3 rounded-xl border font-bold text-sm">Cancelar</button>
    <button onClick={()=>void save()} disabled={busy||invalido} className="px-5 py-3 rounded-xl bg-emerald-600 text-white font-black text-sm disabled:opacity-50">{busy?'Registrando…':`Registrar venta · ${money(total)}`}</button></div>
  </div>
 </div>;
}
