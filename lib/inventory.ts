export type DressClassification={id:number;nombre:string;orden:number;activo:boolean};
export type DressReferences=Record<'contratos'|'traslados'|'fuera_tienda'|'cambios_contrato'|'bloqueo_contrato'|'mantenimiento'|'prestamos',number>;

/** States grouped as the inventory team reads them; raw DB values stay as they are (other modules compare them literally). */
export const STATUS_GROUPS=[
 {id:'disponible',label:'Disponible',values:['disponible']},
 {id:'mantenimiento',label:'En mantenimiento',values:['en mantenimiento','mantenimiento','lavanderia','lavandería']},
 {id:'reservado',label:'Reservado',values:['reservado']},
 {id:'vendido',label:'Vendido',values:['vendido']},
 {id:'baja',label:'Dañado / Baja',values:['dañado/baja','de baja']},
 {id:'evento',label:'Alquilado / En evento',values:['alquilado','en evento']},
] as const;
export type StatusGroupId=typeof STATUS_GROUPS[number]['id']|'otro';

export function statusGroup(estado:unknown):StatusGroupId{
 const value=String(estado??'Disponible').trim().toLowerCase()||'disponible';
 return STATUS_GROUPS.find(g=>(g.values as readonly string[]).includes(value))?.id??'otro';
}
export const statusLabel=(estado:unknown)=>STATUS_GROUPS.find(g=>g.id===statusGroup(estado))?.label??String(estado||'Sin estado');
export const isRetiredDress=(estado:unknown)=>statusGroup(estado)==='baja';

export const CLASSIFICATION_STYLES:Record<string,string>={
 'Novia':'bg-white text-gray-700 border-gray-300',
 'XV Años':'bg-pink-100 text-pink-700 border-pink-200',
 'Gala':'bg-slate-800 text-white border-slate-900',
 'Pajecita':'bg-purple-100 text-purple-700 border-purple-200',
 'Vestido de cambio':'bg-teal-50 text-teal-700 border-teal-200',
 'Otro':'bg-amber-50 text-amber-700 border-amber-200',
};
export const UNCLASSIFIED_STYLE='bg-gray-50 text-gray-400 border-gray-300 border-dashed';

/** Same rule as the inventory guide: suggests a classification from the dress name/code, or null to review by hand. */
export function suggestClassification(nombre:unknown,codigo:unknown){
 const n=String(nombre??''),c=String(codigo??'');
 if(/paje/i.test(n)||/paje/i.test(c))return 'Pajecita';
 if(/de\s+ca[mn][bv]io/i.test(n))return 'Vestido de cambio';
 if(/novia/i.test(n))return 'Novia';
 if(/(^|[^a-z0-9])xv([^a-z0-9]|$)|quince/i.test(n))return 'XV Años';
 if(/gala/i.test(n))return 'Gala';
 return null;
}

export const referenceTotal=(refs:Partial<DressReferences>|null|undefined)=>Object.values(refs||{}).reduce((t:number,v)=>t+Number(v||0),0);
const REFERENCE_LABELS:Record<string,[string,string]>={contratos:['contrato','contratos'],traslados:['traslado','traslados'],fuera_tienda:['salida de tienda','salidas de tienda'],
 cambios_contrato:['cambio de contrato','cambios de contrato'],bloqueo_contrato:['bloqueo especial','bloqueos especiales'],mantenimiento:['mantenimiento','mantenimientos'],prestamos:['préstamo','préstamos']};
export const referenceChips=(refs:Partial<DressReferences>|null|undefined)=>Object.entries(refs||{}).filter(([,v])=>Number(v)>0)
 .map(([k,v])=>`${v} ${(REFERENCE_LABELS[k]||[k,k])[Number(v)===1?0:1]}`);

type Row={sede_actual_id?:string|null;estado?:unknown};
/** Site × status table; dresses without a site go to the "sin sede" row. */
export function statusCrossTab(rows:Row[],sedes:{id:string;nombre:string}[]){
 const groups=[...STATUS_GROUPS.map(g=>g.id),'otro'] as StatusGroupId[];
 const empty=()=>Object.fromEntries(groups.map(g=>[g,0])) as Record<StatusGroupId,number>;
 const known=new Set(sedes.map(s=>s.id));
 const lines=[...sedes.map(s=>({id:s.id,nombre:s.nombre})),{id:'',nombre:'Sin sede asignada'}].map(s=>({...s,counts:empty(),total:0}));
 const totals={counts:empty(),total:0};
 for(const r of rows){
  const id=r.sede_actual_id&&known.has(r.sede_actual_id)?r.sede_actual_id:'';
  const line=lines.find(l=>l.id===id)!,g=statusGroup(r.estado);
  line.counts[g]++;line.total++;totals.counts[g]++;totals.total++;
 }
 return {lines:lines.filter(l=>l.id||l.total>0),totals,showOther:totals.counts.otro>0};
}

/** CSV that Excel opens with accents intact (BOM + semicolons, Colombian Excel default separator). */
export function toExcelCsv(header:string[],rows:unknown[][]){
 const cell=(v:unknown)=>{const s=String(v??'');const safe=/^[=+\-@]/.test(s)?`'${s}`:s;return /[";\n\r]/.test(safe)?`"${safe.replace(/"/g,'""')}"`:safe;};
 return '﻿'+[header,...rows].map(r=>r.map(cell).join(';')).join('\r\n');
}
