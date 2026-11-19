'use client';
import {useEffect,useRef,useState} from 'react';
import SignatureCanvas from 'react-signature-canvas';
import {CheckCircle,Eraser,Loader2,PenTool} from 'lucide-react';
import AllyContractText from '@/components/AllyContractText';
import type {ContractSection} from '@/lib/ally-contract-text';

type Datos={cedula:string;direccion:string;correo:string;quinceanera:string;ti:string};
type View={firmado:true;texto:ContractSection[];firma:string;firmado_at:string;nombre:string;codigo?:string;pdf?:string|null}|{firmado:false;plan:{nombre:string;sede:string;numero:number};datos:Datos;texto:ContractSection[]};
const call=async(body:Record<string,unknown>)=>{const r=await fetch('/api/plan-ahorro/firma',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo continuar.');return d;};
const FIELDS:[keyof Datos,string,string?][]=[['cedula','Tu número de cédula','numeric'],['direccion','Tu dirección'],['correo','Tu correo (opcional)','email'],['quinceanera','Nombre completo de la quinceañera'],['ti','Tarjeta de identidad de la quinceañera (opcional)','numeric']];

/** Private page where the family reads and signs its Plan Ahorro XV contract (link sent from the ERP). */
export default function PlanAhorroFirmaPage(){
 const [token,setToken]=useState(''),[view,setView]=useState<View|null>(null),[datos,setDatos]=useState<Datos|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [acepta,setAcepta]=useState(false),[aceptaDatos,setAceptaDatos]=useState(false),[comercial,setComercial]=useState<boolean|null>(null);
 const pad=useRef<SignatureCanvas>(null);
 useEffect(()=>{
  const t=decodeURIComponent(window.location.hash.slice(1));
  history.replaceState(null,'',window.location.pathname);
  if(!t){setError('Abre el enlace completo que te envió Ámbar Couture.');return;}
  setToken(t);
  call({token:t,accion:'ver'}).then((d:View)=>{setView(d);if(!d.firmado)setDatos(d.datos);}).catch(e=>setError(e.message));
 },[]);
 // The contract shown updates with the data the family writes.
 const actualizar=async()=>{if(!datos||!token)return;try{const d=await call({token,accion:'ver',datos}) as View;if(!d.firmado)setView(d);}catch{/* keeps the previous text */}};
 const firmar=async()=>{
  setError('');if(!datos)return;
  if(!acepta)return setError('Marca la casilla para aceptar el contrato.');
  if(!aceptaDatos)return setError('Marca la autorización de tratamiento de datos (obligatoria).');
  if(comercial===null)return setError('Elige si autorizas o no recibir promociones de Ámbar Couture.');
  if(!pad.current||pad.current.isEmpty())return setError('Dibuja tu firma en el recuadro.');
  setBusy(true);
  try{const d=await call({token,accion:'firmar',datos,acepta,acepta_datos:aceptaDatos,comercial,firma:pad.current.getTrimmedCanvas().toDataURL('image/png')});setView(d);window.scrollTo({top:0,behavior:'smooth'});}
  catch(e){setError(e instanceof Error?e.message:'No se pudo firmar.');}
  finally{setBusy(false);}
 };
 const descargar=(b64:string)=>{const a=document.createElement('a');a.href=`data:application/pdf;base64,${b64}`;a.download='Contrato-Plan-Ahorro-XV.pdf';a.click();};
 const input='w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-400';
 return <main className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-3xl mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE · PLAN AHORRO XV</p><h1 className="text-2xl font-black text-gray-900 mt-2">Contrato del Plan Ahorro XV</h1></header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold">{error}</p>}
   {!view&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando contrato…</p>}
   {view?.firmado&&<>
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex gap-3 items-start"><CheckCircle className="w-6 h-6 text-emerald-600 shrink-0"/><div><p className="font-black text-emerald-800">Contrato firmado</p>
     <p className="text-sm text-emerald-700">Firmado por {view.nombre} el {new Date(view.firmado_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}{view.codigo?` · código ${view.codigo}`:''}. La asesora de tu sede te escribirá por WhatsApp con los datos para pagar tu primera cuota (en la tienda o por transferencia).</p></div></div>
    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm"><AllyContractText sections={view.texto}/><div className="mt-6 border-t pt-4"><p className="text-xs font-bold text-gray-500 mb-2">Firma de EL AHORRADOR</p><img src={view.firma} alt="Firma" className="h-20"/></div></div>
    {view.pdf?<button type="button" onClick={()=>descargar(view.pdf!)} className="w-full rounded-2xl bg-gray-900 text-white py-3 font-bold text-sm">Descargar mi contrato (PDF)</button>
     :<button type="button" onClick={()=>window.print()} className="w-full rounded-2xl border border-gray-200 bg-white py-3 font-bold text-sm">Imprimir o guardar en PDF</button>}
   </>}
   {view&&!view.firmado&&datos&&<>
    <section className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
     <h2 className="font-black text-gray-900 mb-1">1. Tus datos</h2><p className="text-xs text-gray-500 mb-4">Hola, {view.plan.nombre}. Completa tus datos para el contrato del plan n.º {view.plan.numero} en Ámbar Couture {view.plan.sede}.</p>
     <div className="grid sm:grid-cols-2 gap-3">{FIELDS.map(([k,label,type])=><label key={k} className="text-xs font-bold text-gray-600">{label}<input className={input} inputMode={type==='numeric'?'numeric':type==='email'?'email':undefined} value={datos[k]} onChange={e=>setDatos({...datos,[k]:e.target.value})} onBlur={()=>void actualizar()}/></label>)}</div>
    </section>
    <section className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm"><h2 className="font-black text-gray-900 mb-3">2. Lee el contrato</h2><div className="max-h-[60vh] overflow-y-auto pr-2"><AllyContractText sections={view.texto}/></div></section>
    <section className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
     <h2 className="font-black text-gray-900">3. Acepta y firma</h2>
     <label className="flex gap-2 items-start text-sm text-gray-700"><input type="checkbox" checked={acepta} onChange={e=>setAcepta(e.target.checked)} className="mt-1"/>Leí y acepto el Contrato del Plan Ahorro XV.</label>
     <label className="flex gap-2 items-start text-sm text-gray-700"><input type="checkbox" checked={aceptaDatos} onChange={e=>setAceptaDatos(e.target.checked)} className="mt-1"/>Autorizo el tratamiento de mis datos personales y los de la quinceañera, como su representante legal, según la Ley 1581 de 2012 y la Política de Tratamiento de Datos de Ámbar Couture.</label>
     <div className="text-sm text-gray-700"><p className="font-bold mb-1">¿Quieres recibir promociones y novedades de Ámbar Couture? (obligatorio elegir)</p>
      <div className="flex gap-4"><label className="flex gap-2 items-center"><input type="radio" checked={comercial===true} onChange={()=>setComercial(true)}/>Sí autorizo</label><label className="flex gap-2 items-center"><input type="radio" checked={comercial===false} onChange={()=>setComercial(false)}/>No autorizo</label></div></div>
     <div><p className="text-xs font-bold text-gray-600 mb-1 flex items-center gap-1"><PenTool className="w-3.5 h-3.5"/> Dibuja tu firma</p>
      <div className="border-2 border-dashed border-gray-300 rounded-2xl bg-white"><SignatureCanvas ref={pad} penColor="#111" canvasProps={{className:'w-full h-44 rounded-2xl'}}/></div>
      <button type="button" onClick={()=>pad.current?.clear()} className="mt-2 text-xs font-bold text-gray-500 flex items-center gap-1"><Eraser className="w-3.5 h-3.5"/> Borrar firma</button></div>
     <button type="button" disabled={busy} onClick={()=>void firmar()} className="w-full rounded-2xl bg-rose-600 text-white py-3 font-black disabled:opacity-50">{busy?'Firmando…':'Firmar contrato'}</button>
    </section>
   </>}
  </div>
 </main>;
}
