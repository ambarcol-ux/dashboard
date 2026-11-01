'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {AUTH_ORIGIN_LABEL,authLink,loadAuthTexts,type AuthChoice,type AuthState,type AuthTexts} from '@/lib/data-authorization';

/** Team forms (vitrina, contrato): asks once per person. Already authorized → shows it; otherwise processing (required) and commercial (optional, unchecked). */
export default function DataAuthorization({documento,telefono,value,onChange,onState}:{documento:string;telefono:string;value:AuthChoice;onChange:(v:AuthChoice)=>void;onState?:(s:AuthState)=>void}){
 const [texts,setTexts]=useState<AuthTexts|null>(null),[state,setState]=useState<AuthState>(null);
 useEffect(()=>{void loadAuthTexts(supabase).then(setTexts);},[]);
 useEffect(()=>{
  const doc=documento.replace(/\W/g,''),tel=telefono.replace(/\D/g,'');
  if(doc.length<5&&tel.length<10){setState(null);onState?.(null);return;}
  let live=true;const t=setTimeout(()=>{void supabase.rpc('autorizacion_de',{p_documento:doc||null,p_telefono:tel||null}).then(({data})=>{if(live){setState((data as AuthState)||null);onState?.((data as AuthState)||null);}});},400);
  return()=>{live=false;clearTimeout(t);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[documento,telefono]);
 const ok=state?.estado==='autorizada';
 return <div style={{border:'1px solid #e5e7eb',borderRadius:12,padding:12,display:'grid',gap:8,fontSize:13}}>
  <strong>Autorización de datos personales</strong>
  {ok?<p style={{color:'#047857',margin:0}}>Ya autorizó el tratamiento el {new Date(state!.tratamiento_at||'').toLocaleDateString('es-CO')} ({AUTH_ORIGIN_LABEL[state!.origen]||state!.origen}){state!.comercial?' · comercial: sí':''}.</p>
  :<>{texts?.tratamiento&&<p style={{margin:0,color:'#555',fontSize:12}}>{texts.tratamiento.texto}</p>}
   <label style={{display:'flex',gap:8,alignItems:'flex-start'}}><input type="checkbox" checked={value.tratamiento} onChange={e=>onChange({...value,tratamiento:e.target.checked})}/>La persona autoriza el tratamiento de sus datos (obligatorio)</label>
   {state?.estado==='pendiente'&&<p style={{margin:0,fontSize:12,color:'#92400e'}}>Tiene una autorización pendiente. <button type="button" style={{textDecoration:'underline'}} onClick={()=>void navigator.clipboard?.writeText(authLink(window.location.origin,state.token))}>Copiar su enlace</button></p>}</>}
  {!(ok&&state?.comercial)&&<>{texts?.comercial&&<p style={{margin:0,color:'#555',fontSize:12}}>{texts.comercial.texto}</p>}
   <label style={{display:'flex',gap:8,alignItems:'flex-start'}}><input type="checkbox" checked={value.comercial} onChange={e=>onChange({...value,comercial:e.target.checked})}/>Acepta recibir información comercial (opcional)</label></>}
 </div>;
}

/** Saves the authorization chosen in a team form (skips when already authorized and nothing new was accepted). */
export async function saveDataAuthorization(p:{documento:string;telefono:string;nombre:string;email?:string;sede:string|null;origen:'vitrina'|'contrato';choice:AuthChoice;state:AuthState}){
 if(p.state?.estado==='autorizada'&&(!p.choice.comercial||p.state.comercial))return;
 const {error}=await supabase.rpc('registrar_autorizacion',{p_documento:p.documento||null,p_telefono:p.telefono||null,p_nombre:p.nombre,p_email:p.email||null,p_sede:p.sede,p_origen:p.origen,p_tratamiento:p.state?.estado==='autorizada'||p.choice.tratamiento,p_comercial:p.choice.comercial});
 if(error)throw new Error(error.message);
}
