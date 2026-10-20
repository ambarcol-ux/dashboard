'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

const TTL=60_000;
let cache:{id:string;at:number;value:string[]}|null=null;

/** Effective permissions of the signed-in user (sum of all their roles; null while loading). Cached for a minute. */
export function usePermissions(userId?:string|null){
 const fresh=(id?:string|null)=>!!id&&cache?.id===id&&Date.now()-cache.at<TTL;
 const [value,setValue]=useState<string[]|null>(()=>fresh(userId)?cache!.value:null);
 useEffect(()=>{
  if(!userId||fresh(userId))return;
  let live=true;
  void supabase.rpc('mis_permisos').then(({data,error})=>{
   if(error)return;
   const next=(data||[]) as string[];cache={id:userId,at:Date.now(),value:next};
   if(live)setValue(next);
  });
  return()=>{live=false;};
 },[userId]);
 return userId&&cache?.id===userId?(value??cache.value):value;
}
export const resetPermissions=()=>{cache=null;};
export const can=(perms:string[]|null|undefined,code:string)=>!!perms?.includes(code);
