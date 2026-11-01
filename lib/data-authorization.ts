import type {SupabaseClient} from '@supabase/supabase-js';

/** Personal data authorizations (Ley 1581): processing (required) and commercial (optional, never pre-checked), once per person. */
export type AuthTexts={tratamiento:{version:number;texto:string}|null;comercial:{version:number;texto:string}|null;declaracion_aliado:{version:number;texto:string}|null};
export type AuthState={estado:'pendiente'|'autorizada'|'revocada';comercial:boolean;tratamiento_at:string|null;origen:string;token:string}|null;
export type AuthChoice={tratamiento:boolean;comercial:boolean};

export const AUTH_ORIGIN_LABEL:Record<string,string>={agendamiento:'Agendamiento',confirmacion:'Enlace de confirmación',vitrina:'Vitrina',contrato:'Contrato',vinculacion_aliado:'Vinculación de aliado',clienta_aliado:'Clienta de aliado'};
export const authLink=(origin:string,token:string)=>`${origin.replace(/\/$/,'')}/autorizacion/${token}`;

/** Latest version of each configured text (Configuración › Autorizaciones). */
export async function loadAuthTexts(db:SupabaseClient):Promise<AuthTexts>{
 const {data}=await db.from('autorizaciones_textos').select('tipo,version,texto').order('version',{ascending:false});
 const pick=(t:string)=>{const r=(data||[]).find(x=>x.tipo===t);return r?{version:Number(r.version),texto:String(r.texto)}:null;};
 return {tratamiento:pick('tratamiento'),comercial:pick('comercial'),declaracion_aliado:pick('declaracion_aliado')};
}

/** Server APIs (service role): registers the authorization; pendiente = the person accepts later with her own link. */
export async function registerAuthorization(db:SupabaseClient,p:{documento?:string|null;telefono?:string|null;nombre?:string|null;email?:string|null;sede?:string|null;origen:string;tratamiento:boolean;comercial:boolean;pendiente:boolean;aliado?:string|null;registradoPor?:string|null;versionTratamiento?:string|null}){
 const {data,error}=await db.rpc('autorizacion_publica',{p_documento:p.documento||null,p_telefono:p.telefono||null,p_nombre:p.nombre||null,p_email:p.email||null,p_sede:p.sede||null,p_origen:p.origen,
  p_tratamiento:p.tratamiento,p_comercial:p.comercial,p_pendiente:p.pendiente,p_aliado:p.aliado||null,p_registrado_por:p.registradoPor||null,p_version_tratamiento:p.versionTratamiento||null});
 if(error)throw error;
 return data as {id:string;estado:string;comercial:boolean;token:string};
}
