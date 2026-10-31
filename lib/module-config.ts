import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

/** Configuración (Listas, Parámetros y Formularios) shared by the modules; edited only by Administración. */
export type FieldState='bloqueado'|'obligatorio'|'opcional'|'oculto';
export type ModuleConfig={lists:Record<string,string[]>;params:Record<string,number|boolean>;forms:Record<string,FieldState>};

export const emptyConfig:ModuleConfig={lists:{},params:{},forms:{}};

/** Active list values, parameters and form field states of a module (lists by prefix, e.g. 'pv_'). */
export async function loadModuleConfig(modulo:string,listPrefix:string):Promise<ModuleConfig>{
 const [l,p,f]=await Promise.all([
  supabase.from('listas_contrato').select('lista,valor').like('lista',`${listPrefix}%`).eq('activo',true).order('orden'),
  supabase.from('config_parametros').select('clave,valor').eq('modulo',modulo),
  supabase.from('config_formularios').select('formulario,campo,estado').eq('modulo',modulo)]);
 const lists:Record<string,string[]>={};
 for(const r of l.data||[])(lists[r.lista]??=[]).push(r.valor);
 return {lists,params:Object.fromEntries((p.data||[]).map(r=>[r.clave,r.valor])),forms:Object.fromEntries((f.data||[]).map(r=>[`${r.formulario}.${r.campo}`,r.estado as FieldState]))};
}

/** Minimum characters for conclusions and «Otro» (Primeras visitas). */
export const minChars=(c:ModuleConfig)=>Number(c.params.min_caracteres)||30;
/** Field state, 'obligatorio' when not configured. */
export const fieldState=(c:ModuleConfig,form:string,field:string):FieldState=>c.forms[`${form}.${field}`]||'obligatorio';

/** Active values of several Configuración lists (React hook for client pages). */
export function useLists(names:string[]){
 const key=names.join('|');
 const [lists,setLists]=useState<Record<string,string[]>>({});
 useEffect(()=>{let live=true;void supabase.from('listas_contrato').select('lista,valor').in('lista',key.split('|')).eq('activo',true).order('orden').then(({data})=>{
  if(!live)return;const out:Record<string,string[]>={};for(const r of data||[])(out[r.lista]??=[]).push(r.valor);setLists(out);});return()=>{live=false;};},[key]);
 return lists;
}
