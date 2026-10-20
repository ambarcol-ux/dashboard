'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import SignatureCanvas from 'react-signature-canvas';
import {CheckCircle,Eraser,Loader2,PenTool} from 'lucide-react';
import AllyContractText from '@/components/AllyContractText';
import {DATA_AUTHORIZATION,allyContractText,type AllyContractConfig,type AllyProfile,type ContractSection} from '@/lib/ally-contract-text';

type View={firmado:true;texto:ContractSection[];firma:string;firmado_at:string;nombre:string;codigo?:string}|{firmado:false;directo?:boolean;config:AllyContractConfig;aliado:AllyProfile};
const ACCOUNT_TYPES=['Ahorros','Corriente','Nequi / Daviplata','Otra'];
const FIELDS:[keyof AllyProfile,string,string?][]=[['nombre','Nombre completo o razón social'],['cedula','Cédula o NIT','numeric'],['representante','Representante (si es empresa)'],['celular','Celular','tel'],['correo','Correo electrónico','email'],['direccion','Dirección'],['ciudad','Ciudad'],['banco','Banco'],['numero_cuenta','Número de cuenta']];

const call=async(body:Record<string,unknown>)=>{const r=await fetch('/api/aliados/contrato',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo cargar el contrato.');return d;};

/** Private page where an ally completes their profile and signs the alliance contract once. */
export default function AllyContractPage(){
 const [token,setToken]=useState(''),[view,setView]=useState<View|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [datos,setDatos]=useState<AllyProfile|null>(null),[acepta,setAcepta]=useState(false),[aceptaDatos,setAceptaDatos]=useState(false);
 const pad=useRef<SignatureCanvas>(null);
 useEffect(()=>{
  const t=decodeURIComponent(window.location.hash.slice(1));
  history.replaceState(null,'',window.location.pathname);
  if(!t){setError('Abre el enlace completo que te envió Ámbar Couture.');return;}
  setToken(t);
  call({token:t,accion:'ver'}).then((d:View)=>{setView(d);if(!d.firmado)setDatos(d.aliado);}).catch(e=>setError(e.message));
 },[]);
 const directo=!!view&&!view.firmado&&!!view.directo;
 const preview=useMemo(()=>view&&!view.firmado&&datos?allyContractText(view.config,datos,new Date(),view.directo?[DATA_AUTHORIZATION]:[]):null,[view,datos]);
 const sign=async()=>{
  setError('');
  if(!datos)return;
  if(!acepta)return setError('Marca la casilla para aceptar el contrato.');
  if(directo&&!aceptaDatos)return setError('Marca la casilla de autorización de tratamiento de datos.');
  if(!pad.current||pad.current.isEmpty())return setError('Dibuja tu firma en el recuadro.');
  setBusy(true);
  try{const d=await call({token,accion:'firmar',datos,acepta,acepta_datos:aceptaDatos,firma:pad.current.getTrimmedCanvas().toDataURL('image/png')});setView(d);window.scrollTo({top:0,behavior:'smooth'});}
  catch(e){setError(e instanceof Error?e.message:'No se pudo firmar.');}
  finally{setBusy(false);}
 };
 const input='w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-400';
 return <main className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-3xl mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE · RED DE ALIADOS</p><h1 className="text-2xl font-black text-gray-900 mt-2">Contrato de Alianza Comercial – Préstamo de Vestidos</h1></header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold">{error}</p>}
   {!view&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando contrato…</p>}
   {view?.firmado&&<>
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex gap-3 items-start"><CheckCircle className="w-6 h-6 text-emerald-600 shrink-0"/><div><p className="font-black text-emerald-800">Contrato firmado</p><p className="text-sm text-emerald-700">{view.nombre} firmó el {new Date(view.firmado_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}{view.codigo?` · Código de verificación ${view.codigo}`:''}. El contrato se firma una sola vez y queda guardado en tu perfil de aliado.</p></div></div>
    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm"><AllyContractText sections={view.texto}/><div className="mt-6 border-t pt-4"><p className="text-xs font-bold text-gray-500 mb-2">Firma de EL ALIADO</p><img src={view.firma} alt="Firma del aliado" className="max-h-28"/></div></div>
    <button onClick={()=>window.print()} className="w-full rounded-2xl border border-gray-200 bg-white py-3 font-bold text-sm">Imprimir o guardar en PDF</button>
   </>}
   {view&&!view.firmado&&datos&&<>
    <section className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
     <h2 className="font-black text-gray-900 mb-1">1. {directo?'Revisa tus datos':'Tus datos'}</h2><p className="text-xs text-gray-500 mb-4">{directo?'Ámbar Couture registró estos datos en tu perfil. Si algo está mal, avísale antes de firmar.':'Se usan en el contrato y quedan guardados en tu perfil de aliado.'}</p>
     {directo?<dl className="grid sm:grid-cols-2 gap-3 text-sm">{([['nombre','Nombre completo'],['cedula','Cédula'],['celular','Celular'],['correo','Correo'],['direccion','Dirección']] as [keyof AllyProfile,string][]).map(([k,l])=><div key={k} className="bg-gray-50 rounded-xl px-3 py-2"><dt className="text-[11px] font-bold text-gray-500">{l}</dt><dd className="font-bold text-gray-900">{datos[k]}</dd></div>)}</dl>:
     <div className="grid sm:grid-cols-2 gap-3">
      {FIELDS.map(([k,label,type])=><label key={k} className="text-xs font-bold text-gray-600">{label}<input className={input} inputMode={type==='numeric'?'numeric':undefined} type={type==='email'?'email':type==='tel'?'tel':'text'} value={datos[k]} onChange={e=>setDatos({...datos,[k]:e.target.value})}/></label>)}
      <label className="text-xs font-bold text-gray-600">Tipo de cuenta<select className={input} value={datos.tipo_cuenta} onChange={e=>setDatos({...datos,tipo_cuenta:e.target.value})}><option value="">Selecciona…</option>{ACCOUNT_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
     </div>}
    </section>
    <section className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm"><h2 className="font-black text-gray-900 mb-4">2. Lee el contrato</h2><div className="max-h-[60vh] overflow-y-auto pr-2">{preview&&<AllyContractText sections={preview}/>}</div></section>
    <section className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
     <h2 className="font-black text-gray-900 flex items-center gap-2"><PenTool className="w-5 h-5 text-rose-500"/> 3. Firma</h2>
     <label className="flex gap-2 items-start text-sm text-gray-700"><input type="checkbox" className="mt-1" checked={acepta} onChange={e=>setAcepta(e.target.checked)}/>He leído y acepto el Contrato de Alianza Comercial – Préstamo de Vestidos de Ámbar Couture. Entiendo que se firma una sola vez y aplica a todos mis préstamos.</label>
     {directo&&<label className="flex gap-2 items-start text-sm text-gray-700"><input type="checkbox" className="mt-1" checked={aceptaDatos} onChange={e=>setAceptaDatos(e.target.checked)}/>Autorizo el tratamiento de mis datos personales según la Ley 1581 de 2012, en los términos de la cláusula de autorización del contrato.</label>}
     <div className="border-2 border-rose-200 rounded-2xl bg-[#fafafa] relative" style={{touchAction:'none'}}>
      <span className="absolute top-3 left-3 text-gray-400 text-xs flex items-center gap-1 pointer-events-none"><Eraser className="w-3 h-3"/> Dibuja aquí tu firma</span>
      <SignatureCanvas ref={pad} penColor="#0f172a" canvasProps={{className:'w-full h-56'}}/>
     </div>
     <div className="flex gap-3"><button type="button" onClick={()=>pad.current?.clear()} className="px-4 py-3 rounded-xl border border-gray-200 text-sm font-bold">Borrar firma</button>
      <button type="button" disabled={busy} onClick={()=>void sign()} className="flex-1 px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-50">{busy?'Firmando…':'Firmar contrato'}</button></div>
    </section>
   </>}
  </div>
 </main>;
}
