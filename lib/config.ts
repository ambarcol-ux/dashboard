'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

/** Configuración del Administrador (Listas, Parámetros, Formularios). Si no carga, cada uso cae en su valor de respaldo. */
export type ConfigItem={valor:string;etiqueta:string};
type Row={lista:string;valor:string;etiqueta:string|null;activo:boolean;bloqueado:boolean|null};
type Field={campo:string;etiqueta:string};
export type ConfigData={items:Record<string,Row[]>;params:Record<string,unknown>;forms:Record<string,Field[]>};
const EMPTY:ConfigData={items:{},params:{},forms:{}};
let cache:{at:number;data:Promise<ConfigData>}|null=null;

export function loadConfig(force=false):Promise<ConfigData>{
 if(!force&&cache&&Date.now()-cache.at<60000)return cache.data;
 const data=(async()=>{
  const [l,p,f]=await Promise.all([
   supabase.from('listas_contrato').select('lista,valor,etiqueta,activo,bloqueado').order('orden'),
   supabase.from('config_parametros').select('clave,valor,activo'),
   supabase.from('config_formularios').select('clave,campos,activo'),
  ]);
  const out:ConfigData={items:{},params:{},forms:{}};
  for(const r of (l.error?[]:l.data||[]) as Row[])(out.items[r.lista]||=[]).push(r);
  for(const r of (p.error?[]:p.data||[]) as {clave:string;valor:unknown;activo:boolean}[])if(r.activo)out.params[r.clave]=r.valor;
  for(const r of (f.error?[]:f.data||[]) as {clave:string;campos:Field[];activo:boolean}[])if(r.activo&&Array.isArray(r.campos))out.forms[r.clave]=r.campos;
  return out;
 })().catch(()=>EMPTY);
 cache={at:Date.now(),data};
 return data;
}

export function configTools(d:ConfigData){
 /** Opciones activas de una lista; lo bloqueado siempre se muestra. */
 const list=(clave:string,fallback:readonly string[]|Record<string,string>):ConfigItem[]=>{
  const rows=d.items[clave];
  if(rows?.length)return rows.filter(r=>r.activo||r.bloqueado).map(r=>({valor:r.valor,etiqueta:r.etiqueta||r.valor}));
  return Array.isArray(fallback)?fallback.map(v=>({valor:v,etiqueta:v})):Object.entries(fallback).map(([valor,etiqueta])=>({valor,etiqueta}));
 };
 /** Etiqueta de un valor guardado (aunque esté inactivo). */
 const name=(clave:string,valor:string,fallback:Record<string,string>={})=>d.items[clave]?.find(r=>r.valor===valor)?.etiqueta||fallback[valor]||valor;
 const param=(clave:string,fallback:number)=>{const v=Number(d.params[clave]);return Number.isFinite(v)&&d.params[clave]!==null&&d.params[clave]!==undefined?v:fallback;};
 const field=(form:string,campo:string,fallback:string)=>d.forms[form]?.find(x=>x.campo===campo)?.etiqueta||fallback;
 return {list,name,param,field};
}

export function useConfig(){
 const [data,setData]=useState<ConfigData>(EMPTY);
 useEffect(()=>{let live=true;void loadConfig().then(x=>{if(live)setData(x);});return()=>{live=false;};},[]);
 return configTools(data);
}
