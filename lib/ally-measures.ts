/** Medidas virtuales (paso 7): fields come from Configuración (same as the store sheet), values in cm. */
export type MeasureField={id:number;nombre:string;instruccion:string;imagen_path:string|null;imagen_url?:string|null;minimo:number|null;maximo:number|null;orden:number;activo:boolean};
export const MEASURE_STATES=['Pendiente','Enviadas','Revisadas','Corrección solicitada','Aprobadas'] as const;
export const cm=(v:unknown)=>{const n=Number(String(v??'').replace(',','.').trim());return Number.isFinite(n)?n:NaN;};
/** Every active field is required and must be a positive number of cm. */
export function measureErrors(fields:MeasureField[],values:Record<string,unknown>){
 return fields.filter(f=>!(cm(values[f.nombre])>0&&cm(values[f.nombre])<=300)).map(f=>`${f.nombre}: escribe la medida en cm.`);
}
/** Range and coherence alerts: they only warn, never block. */
export function measureAlerts(fields:MeasureField[],values:Record<string,unknown>){
 const out:string[]=[];
 for(const f of fields){const v=cm(values[f.nombre]);if(!(v>0))continue;
  if(f.minimo!=null&&v<Number(f.minimo))out.push(`${f.nombre}: ${v} cm es menos de lo usual (mín. ${f.minimo}).`);
  if(f.maximo!=null&&v>Number(f.maximo))out.push(`${f.nombre}: ${v} cm es más de lo usual (máx. ${f.maximo}).`);}
 const by=(re:RegExp)=>{const f=fields.find(x=>re.test(x.nombre.toLowerCase()));return f?cm(values[f.nombre]):NaN;};
 const busto=by(/busto|pecho/),cintura=by(/cintura/),cadera=by(/cadera/);
 if(cintura>0&&busto>0&&cintura>busto)out.push('La cintura es mayor que el busto: revisa las medidas.');
 if(cintura>0&&cadera>0&&cintura>cadera)out.push('La cintura es mayor que la cadera: revisa las medidas.');
 return out;
}
