'use client';
import {useState} from 'react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';

type Sede={id:string;nombre:string;telefono?:string|null;whatsapp?:string|null;direccion_clientes?:string|null;mapa_url?:string|null;mapa_etiqueta?:string|null};

/** Contact details each store shows to clients (WhatsApp confirmation and appointment emails). Editable without code. */
export default function SedeContact({sede,onSaved}:{sede:Sede;onSaved:()=>void}){
 const [f,setF]=useState({telefono:sede.telefono||'',whatsapp:sede.whatsapp||'',direccion_clientes:sede.direccion_clientes||'',mapa_url:sede.mapa_url||'',mapa_etiqueta:sede.mapa_etiqueta||'Cómo llegar en Google Maps'}),[busy,setBusy]=useState(false);
 const save=async()=>{
  const whatsapp=f.whatsapp.replace(/\D/g,'');
  if(whatsapp&&!/^\d{10,15}$/.test(whatsapp)){toast.error('WhatsApp: escribe el número con indicativo, ej. 573213473757.');return;}
  if(f.mapa_url&&!f.mapa_url.startsWith('https://')){toast.error('El enlace del mapa debe empezar por https://');return;}
  setBusy(true);
  const {error}=await supabase.from('sedes').update({telefono:f.telefono.trim()||null,whatsapp:whatsapp||null,direccion_clientes:f.direccion_clientes.trim()||null,mapa_url:f.mapa_url.trim()||null,mapa_etiqueta:f.mapa_etiqueta.trim()||null}).eq('id',sede.id);
  setBusy(false);
  if(error){toast.error('No se pudo guardar el contacto de la sede.');return;}
  toast.success(`Contacto de ${sede.nombre} guardado.`);onSaved();
 };
 const input='w-full mt-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs';
 const field=(k:keyof typeof f,label:string,ph:string)=><label className="block text-[11px] font-bold text-gray-600">{label}<input className={input} value={f[k]} placeholder={ph} onChange={e=>setF({...f,[k]:e.target.value})}/></label>;
 return <details className="mt-2"><summary className="cursor-pointer text-[11px] font-bold text-rose-600">Contacto para clientas</summary>
  <div className="mt-2 grid gap-2 w-64 sm:w-80">
   {field('telefono','Teléfono visible','321 347 3757')}
   {field('whatsapp','WhatsApp (con indicativo)','573213473757')}
   {field('direccion_clientes','Dirección para clientas','Calle…, barrio…, referencia')}
   {field('mapa_url','Enlace de Google Maps','https://maps.app.goo.gl/…')}
   {field('mapa_etiqueta','Texto del enlace del mapa','Cómo llegar en Google Maps')}
   <p className="text-[10px] text-gray-500">Se usa en la confirmación de cita por WhatsApp y en los correos de cita.</p>
   <button type="button" disabled={busy} onClick={()=>void save()} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-black disabled:opacity-50">{busy?'Guardando…':'Guardar contacto'}</button>
  </div></details>;
}
