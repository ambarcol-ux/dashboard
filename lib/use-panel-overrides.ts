'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {overridesFromRows,type PanelOverrides} from '@/lib/panel-access';

const TTL=60_000;
let cache:{id:string;at:number;value:PanelOverrides}|null=null;

/** Manual panel changes for the signed-in user (null while loading). Cached for a minute across pages. */
export function usePanelOverrides(userId?:string|null){
 const fresh=(id?:string|null)=>!!id&&cache?.id===id&&Date.now()-cache.at<TTL;
 const [value,setValue]=useState<PanelOverrides|null>(()=>fresh(userId)?cache!.value:null);
 useEffect(()=>{
  if(!userId||fresh(userId))return;
  let live=true;
  void supabase.from('accesos_paneles').select('panel,estado').eq('usuario_id',userId).then(({data,error})=>{
   if(error)return;
   const next=overridesFromRows(data);cache={id:userId,at:Date.now(),value:next};
   if(live)setValue(next);
  });
  return()=>{live=false;};
 },[userId]);
 return userId&&cache?.id===userId?(value??cache.value):value;
}

/** Forget the cached access (after an admin edits their own panels). */
export const resetPanelOverrides=()=>{cache=null;};
