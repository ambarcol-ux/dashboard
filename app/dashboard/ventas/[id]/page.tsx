'use client';
import {useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {supabase} from '@/lib/supabase';
import {ventaNumero} from '@/components/SalesModule';

type Comprobante={id:string;consecutivo:number;fecha:string;created_at:string;estado:string;motivo_anulacion:string|null;precio_lista:number;descuento:number;motivo_descuento:string|null;total:number;medio_pago:string;
 cliente_nombre:string;cliente_documento:string;cliente_telefono:string|null;cliente_email:string|null;numero_factura:string|null;codigo_siigo:string;siigo_estado:string;
 vestido:{codigo:string;nombre:string|null;talla:string|null;color:string|null;tipo:string|null};sede:{nombre:string|null;direccion:string|null;telefono:string|null};vendedor:string|null;
 empresa:{nit:string|null;direccion:string|null;ciudad:string|null;correo:string|null;telefono:string|null}|null};
const LOGO='https://ambarcouture.com/wp-content/uploads/2026/06/logo-ambar-transparente.png';
const money=(n:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n)||0);
const fecha=(d:string)=>d.slice(0,10).split('-').reverse().join('/');

/** Printable sale document. Until Siigo issues the electronic invoice it is a «Comprobante de venta»; with the Siigo number it shows it. */
export default function SaleReceiptPage(){
 const {id}=useParams<{id:string}>();
 const [c,setC]=useState<Comprobante|null>(null),[error,setError]=useState('');
 useEffect(()=>{void supabase.rpc('venta_comprobante',{p_id:id}).then(({data,error})=>{if(error||!data)setError(error?.message||'Venta no encontrada.');else setC(data as Comprobante);});},[id]);
 if(error)return <main className="p-8"><p role="alert" className="text-rose-700 font-bold">{error}</p><Link href="/dashboard/ventas" className="underline">Volver a ventas</Link></main>;
 if(!c)return <main className="p-8 text-gray-500">Cargando comprobante…</main>;
 const e=c.empresa,anulada=c.estado==='anulada';
 const row=(l:string,v:ReactNode)=><div className="flex justify-between gap-4 py-1"><span className="text-gray-500">{l}</span><span className="font-semibold text-right">{v}</span></div>;
 return <main className="min-h-screen bg-gray-100 p-4 print:bg-white print:p-0">
  <style>{'@media print{@page{size:letter;margin:14mm}.no-print{display:none!important}}'}</style>
  <div className="no-print max-w-2xl mx-auto mb-4 flex justify-between gap-2">
   <Link href="/dashboard/ventas" className="px-4 py-2 rounded-xl border bg-white text-sm font-bold">← Ventas</Link>
   <button onClick={()=>window.print()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">Imprimir / guardar PDF</button>
  </div>
  <article className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm p-8 print:shadow-none print:rounded-none text-sm text-gray-800 relative">
   {anulada&&<div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-7xl font-black text-rose-200 -rotate-12">ANULADA</span></div>}
   <header className="flex justify-between items-start gap-4 border-b pb-4">
    <div>
     {/* eslint-disable-next-line @next/next/no-img-element */}
     <img src={LOGO} alt="Ámbar Couture" className="h-14 w-auto mb-2"/>
     <p className="font-black">ÁMBAR COUTURE</p>
     {e?.nit&&<p>NIT {e.nit}</p>}
     <p>{c.sede.nombre}{c.sede.direccion?` · ${c.sede.direccion}`:''}</p>
     {(c.sede.telefono||e?.correo)&&<p>{[c.sede.telefono,e?.correo].filter(Boolean).join(' · ')}</p>}
    </div>
    <div className="text-right">
     <p className="text-lg font-black uppercase">{c.numero_factura?'Factura de venta':'Comprobante de venta'}</p>
     <p className="font-bold">{ventaNumero(c.consecutivo)}</p>
     {c.numero_factura&&<p>Factura electrónica N° <b>{c.numero_factura}</b></p>}
     <p>Fecha: {fecha(c.fecha)}</p>
    </div>
   </header>
   <section className="py-4 border-b">
    <p className="text-xs font-black uppercase text-gray-400 mb-1">Cliente</p>
    <p className="font-bold">{c.cliente_nombre}</p>
    <p>C.C./NIT {c.cliente_documento}{c.cliente_telefono?` · ${c.cliente_telefono}`:''}{c.cliente_email?` · ${c.cliente_email}`:''}</p>
   </section>
   <section className="py-4 border-b">
    <table className="w-full"><thead><tr className="text-left text-xs uppercase text-gray-400"><th className="py-1">Código</th><th>Descripción</th><th className="text-right">Valor</th></tr></thead>
     <tbody><tr><td className="py-2 font-bold">{c.codigo_siigo}</td><td>Venta de vestido {c.vestido.codigo} · {c.vestido.nombre}{c.vestido.tipo?` · ${c.vestido.tipo}`:''} · talla {c.vestido.talla} · {c.vestido.color}</td><td className="text-right">{money(c.precio_lista)}</td></tr></tbody></table>
   </section>
   <section className="py-4 border-b max-w-xs ml-auto">
    {row('Precio de venta',money(c.precio_lista))}
    {Number(c.descuento)>0&&row(`Descuento${c.motivo_descuento?` (${c.motivo_descuento})`:''}`,`− ${money(c.descuento)}`)}
    <div className="flex justify-between gap-4 pt-2 mt-1 border-t text-base"><span className="font-black">Total pagado</span><span className="font-black">{money(c.total)}</span></div>
    {row('Medio de pago',c.medio_pago)}
   </section>
   <footer className="pt-4 text-xs text-gray-500 space-y-1">
    <p>Venta de contado. Atendió: {c.vendedor||'—'}.</p>
    {!c.numero_factura&&<p>Este comprobante soporta el pago recibido. La factura electrónica válida ante la DIAN se emite en Siigo con el código {c.codigo_siigo}.</p>}
    {anulada&&<p className="text-rose-700 font-bold">Venta anulada{c.motivo_anulacion?`: ${c.motivo_anulacion}`:''}.</p>}
   </footer>
  </article>
 </main>;
}
