'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

/** Stores where the current user approves accounting items (public.aprobador_contable_sedes): every store for administration and
 *  accounting; the store leader's own store until 10/12; Pereira for its franquiciado. Empty while loading. */
export function useAprobadorSedes(){
 const [sedes,setSedes]=useState<string[]>([]);
 useEffect(()=>{let live=true;void supabase.rpc('aprobador_contable_sedes').then(({data})=>{if(live)setSedes((data||[]) as string[]);});return()=>{live=false;};},[]);
 return sedes;
}

/** Who resolves a store's accounting items, for labels: «Franquiciado» where the store keeps its own accounting (Pereira),
 *  «Líder de sede o contabilidad» while the store leaders have temporary powers (until 10/12), else «Contabilidad». */
export function useResponsableContable(){
 const [propias,setPropias]=useState<string[]>([]);
 useEffect(()=>{let live=true;void supabase.from('sedes').select('id,contabilidad_franquiciado').then(({data})=>{if(live)setPropias(((data||[]) as {id:string;contabilidad_franquiciado:boolean|null}[]).filter(s=>s.contabilidad_franquiciado).map(s=>s.id));});return()=>{live=false;};},[]);
 const temporal=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'})<='2026-12-10';
 return (sedeId?:string|null)=>sedeId&&propias.includes(sedeId)?'Franquiciado':temporal?'Líder de sede o contabilidad':'Contabilidad';
}
