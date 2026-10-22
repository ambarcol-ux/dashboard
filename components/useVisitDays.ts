'use client';
import {useEffect,useState} from 'react';
import {bogotaDay} from '@/lib/contract-calendar';

/** Closed days (fecha → label) and open modalities from the agenda panel, for the public booking calendar. */
export function useVisitDays(mode:string,site:string){
 const [state,setState]=useState<{key:string;closed:Record<string,string>|null;modes:Record<string,boolean>|null}>({key:'',closed:null,modes:null});
 const key=`${mode}:${site}`;
 useEffect(()=>{
  if(!site||!mode)return;
  const c=new AbortController(),desde=bogotaDay(new Date().toISOString())!,hasta=bogotaDay(new Date(Date.now()+90*86400000).toISOString())!;
  void fetch(`/api/primeras-citas?${new URLSearchParams({desde,hasta,modalidad:mode,sede:site})}`,{signal:c.signal,cache:'no-store'})
   .then(async r=>{const d=await r.json();if(r.ok)setState({key:`${mode}:${site}`,closed:d.cerrados,modes:d.modalidades});})
   .catch(()=>{});
  return()=>c.abort();
 },[mode,site]);
 return state.key===key?{closed:state.closed,modes:state.modes}:{closed:null,modes:state.modes};
}
