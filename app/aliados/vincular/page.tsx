'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import SignatureCanvas from 'react-signature-canvas';
import {CheckCircle,Eraser,Loader2,PenTool} from 'lucide-react';
import AllyContractText from '@/components/AllyContractText';
import {agreementDate,allyContractText,fillAgreement,type AllyContractConfig,type ContractSection} from '@/lib/ally-contract-text';

type Info={tipos:{id:number;nombre:string}[];sedes:{id:string;nombre:string}[];acuerdo:ContractSection[]|null;config:AllyContractConfig|null;autorizacion:ContractSection};
const ACCOUNT_TYPES=['Ahorros','Corriente','Nequi / Daviplata','Otra'];
const FIELDS:[string,string,string?][]=[['nombre_completo','Nombre completo'],['cedula','Cédula','numeric'],['celular','Celular','tel'],['correo','Correo electrónico','email'],['direccion','Dirección'],['banco','Banco'],['numero_cuenta','Número de cuenta','numeric'],['titular_cuenta','Titular de la cuenta']];
const EMPTY:Record<string,string>={nombre_completo:'',cedula:'',celular:'',correo:'',direccion:'',tipo_aliado_id:'',sede_principal:'',banco:'',tipo_cuenta:'',numero_cuenta:'',titular_cuenta:''};

/** Public sign-up of Aliados Directos: form, data authorization, agreement signature; the request stays Pendiente. */
export default function AllySignupPage(){
 const [info,setInfo]=useState<Info|null>(null),[datos,setDatos]=useState(EMPTY),[cert,setCert]=useState<File|null>(null);
 const [aceptaDatos,setAceptaDatos]=useState(false),[acepta,setAcepta]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState<string|null>(null);
 const pad=useRef<SignatureCanvas>(null);
 useEffect(()=>{fetch('/api/aliados/vinculacion').then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo cargar el formulario.');setInfo(d);}).catch(e=>setError(e.message));},[]);
 const tipo=info?.tipos.find(t=>String(t.id)===datos.tipo_aliado_id)?.nombre||'{tipo}';
 const preview=useMemo(()=>{
  if(!info)return null;
  const v={nombre:datos.nombre_completo||'{nombre}',cedula:datos.cedula||'{cédula}',tipo,fecha:agreementDate(new Date())};
  return info.acuerdo?fillAgreement(info.acuerdo,v):info.config?allyContractText(info.config,{nombre:v.nombre,cedula:v.cedula,representante:'',celular:datos.celular,correo:datos.correo,direccion:datos.direccion,ciudad:'Colombia',banco:datos.banco,tipo_cuenta:datos.tipo_cuenta,numero_cuenta:datos.numero_cuenta}):null;
 },[info,datos,tipo]);
 const send=async()=>{
  setError('');
  if(Object.values(datos).some(v=>!v.trim()))return setError('Completa todos tus datos.');
  if(!cert)return setError('Adjunta la certificación bancaria.');
  if(!aceptaDatos)return setError('Marca la autorización de tratamiento de datos.');
  if(!acepta)return setError('Marca la casilla para aceptar el acuerdo.');
  if(!pad.current||pad.current.isEmpty())return setError('Dibuja tu firma en el recuadro.');
  setBusy(true);
  try{
   const form=new FormData();form.append('datos',JSON.stringify(datos));form.append('certificacion',cert);form.append('acepta_datos','true');form.append('acepta','true');form.append('firma',pad.current.getTrimmedCanvas().toDataURL('image/png'));
   const r=await fetch('/api/aliados/vinculacion',{method:'POST',body:form}),d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||'No se pudo enviar tu solicitud.');
   setDone(d.codigo);window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){setError(e instanceof Error?e.message:'No se pudo enviar tu solicitud.');}finally{setBusy(false);}
 };
 const input='w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-400';
 const card='bg-white rounded-3xl border border-gray-100 p-6 shadow-sm';
 return <main className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-3xl mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE · ALIADOS</p><h1 className="text-2xl font-black text-gray-900 mt-2">Vinculación de aliados</h1></header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold">{error}</p>}
   {!info&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {done&&<div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex gap-3 items-start"><CheckCircle className="w-6 h-6 text-emerald-600 shrink-0"/><div><p className="font-black text-emerald-800">Solicitud enviada</p><p className="text-sm text-emerald-700">Firmaste el acuerdo (código de verificación {done}). Te enviamos el PDF a tu correo. Tu solicitud queda Pendiente hasta que Ámbar Couture la apruebe.</p></div></div>}
   {info&&!done&&<>
    <section className={card}><h2 className="font-black text-gray-900 mb-4">1. Tus datos</h2>
     <div className="grid sm:grid-cols-2 gap-3">
      <label className="text-xs font-bold text-gray-600 sm:col-span-2">Tipo de aliado<select className={input} value={datos.tipo_aliado_id} onChange={e=>setDatos({...datos,tipo_aliado_id:e.target.value})}><option value="">Selecciona…</option>{info.tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
      <label className="text-xs font-bold text-gray-600 sm:col-span-2">Sede de Ámbar Couture con la que trabajas<select className={input} value={datos.sede_principal} onChange={e=>setDatos({...datos,sede_principal:e.target.value})}><option value="">Selecciona…</option>{info.sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
      {FIELDS.map(([k,label,type])=><label key={k} className="text-xs font-bold text-gray-600">{label}<input className={input} inputMode={type==='numeric'?'numeric':undefined} type={type==='email'?'email':type==='tel'?'tel':'text'} value={datos[k]} onChange={e=>setDatos({...datos,[k]:e.target.value})}/></label>)}
      <label className="text-xs font-bold text-gray-600">Tipo de cuenta<select className={input} value={datos.tipo_cuenta} onChange={e=>setDatos({...datos,tipo_cuenta:e.target.value})}><option value="">Selecciona…</option>{ACCOUNT_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
      <label className="text-xs font-bold text-gray-600 sm:col-span-2">Certificación bancaria (PDF o foto, obligatoria)<input className={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setCert(e.target.files?.[0]||null)}/></label>
     </div>
    </section>
    <section className={card}><h2 className="font-black text-gray-900 mb-3">2. Autorización de tratamiento de datos</h2>
     <AllyContractText sections={[info.autorizacion]}/>
     <label className="flex gap-2 items-start text-sm text-gray-700 mt-4"><input type="checkbox" className="mt-1" checked={aceptaDatos} onChange={e=>setAceptaDatos(e.target.checked)}/>Autorizo el tratamiento de mis datos personales según la Ley 1581 de 2012.</label>
    </section>
    <section className={card}><h2 className="font-black text-gray-900 mb-4">3. Lee el acuerdo de vinculación</h2><div className="max-h-[60vh] overflow-y-auto pr-2">{preview&&<AllyContractText sections={preview}/>}</div></section>
    <section className={card+' space-y-4'}>
     <h2 className="font-black text-gray-900 flex items-center gap-2"><PenTool className="w-5 h-5 text-rose-500"/> 4. Firma</h2>
     <label className="flex gap-2 items-start text-sm text-gray-700"><input type="checkbox" className="mt-1" checked={acepta} onChange={e=>setAcepta(e.target.checked)}/>He leído y acepto el acuerdo de vinculación como aliado de Ámbar Couture.</label>
     <div className="border-2 border-rose-200 rounded-2xl bg-[#fafafa] relative" style={{touchAction:'none'}}>
      <span className="absolute top-3 left-3 text-gray-400 text-xs flex items-center gap-1 pointer-events-none"><Eraser className="w-3 h-3"/> Dibuja aquí tu firma</span>
      <SignatureCanvas ref={pad} penColor="#0f172a" canvasProps={{className:'w-full h-56'}}/>
     </div>
     <div className="flex gap-3"><button type="button" onClick={()=>pad.current?.clear()} className="px-4 py-3 rounded-xl border border-gray-200 text-sm font-bold">Borrar firma</button>
      <button type="button" disabled={busy} onClick={()=>void send()} className="flex-1 px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-50">{busy?'Enviando…':'Firmar y enviar solicitud'}</button></div>
    </section>
   </>}
  </div>
 </main>;
}
