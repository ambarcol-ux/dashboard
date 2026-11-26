import {isKeyType,keyError} from './bank-keys';
/** Aliados Directos: types and display rules of the module page (no commissions). */
export type AllyType={id:number;nombre:string;activo:boolean};
export type DirectAlly={id:string;nombre:string;cedula:string;celular:string;correo:string;direccion:string;tipo_aliado_id:number;tipo:string;sede_principal:string|null;sede:string|null;
 estado:'pendiente_firma'|'pendiente'|'activo'|'rechazado'|'inactivo';codigo:string|null;origen:'erp'|'enlace';acuerdo_version:string|null;datos_autorizados_at:string|null;datos_texto_version:string|null;acuerdo_pdf_path:string|null;motivo_rechazo:string|null;banco:string|null;tipo_cuenta:string|null;numero_cuenta:string|null;cuenta_mascara:string|null;titular_cuenta:string|null;cuenta_validada:boolean;certificacion_path:string|null;
 archivado?:boolean;motivo_archivo?:string|null;tiene_certificacion?:boolean;
 cambio_pendiente:{id:number;banco:string;tipo_cuenta:string;numero_cuenta:string;titular_cuenta:string;solicitado_at:string;certificacion_path:string|null}|null;
 firma:{fecha:string;version:string;codigo:string}|null;contratos:number;ventas:number};
export type AllySearchResult={id:string;nombre:string;cedula:string;celular:string;correo:string;direccion:string;tipo_aliado_id:number;tipo:string};

export const ALLY_STATUS:Record<DirectAlly['estado'],{label:string;cls:string}>={
 pendiente_firma:{label:'Pendiente de firma',cls:'bg-gray-100 text-gray-600 border-gray-300'},
 pendiente:{label:'Pendiente de aprobación',cls:'bg-amber-50 text-amber-700 border-amber-300'},
 activo:{label:'Activo',cls:'bg-emerald-50 text-emerald-700 border-emerald-300'},
 rechazado:{label:'Rechazado',cls:'bg-gray-50 text-gray-500 border-gray-300'},
 inactivo:{label:'Inactivo',cls:'bg-rose-50 text-rose-700 border-rose-200'},
};

export const onlyDigits=(v:string)=>v.replace(/\D/g,'');
/** Public links of an ally: sign-up form (same for everyone) and, once Active, client registration and availability (by token). */
export const allyLinks=(origin:string,token:string)=>({vincular:`${origin}/aliados/vincular`,clientas:`${origin}/aliados/clientas#${token}`,disponibilidad:`${origin}/aliados/disponibilidad#${token}`,catalogo:`${origin}/aliados/catalogo#${token}`,certificado:`${origin}/aliados/certificado#${token}`});
/** Validates the public sign-up form; returns the clean data or throws a message for the visitor. */
export function allySignup(input:Record<string,unknown>,tipos:number[],sedes?:string[]){
 const t=(k:string,max=200)=>String(input[k]??'').trim().slice(0,max);
 const d={nombre_completo:t('nombre_completo',140),cedula:(/[a-z]/i.test(t('cedula',20))?t('cedula',20).toUpperCase().replace(/[^0-9A-Z]/g,''):t('cedula',20).replace(/\D/g,'')),celular:t('celular',20),correo:t('correo',120).toLowerCase(),direccion:t('direccion'),
  tipo_aliado_id:Number(input.tipo_aliado_id),banco:t('banco',80),tipo_cuenta:t('tipo_cuenta',40),numero_cuenta:t('numero_cuenta',34).replace(/\s/g,''),titular_cuenta:t('titular_cuenta',140),sede_principal:t('sede_principal',40)||null,
  nombre_comercial:t('nombre_comercial',80)||null,instagram:t('instagram',120).replace(/^.*instagram\.com\//i,'').replace(/^@/,'').replace(/[/?].*$/,'')||null,
  tiktok:t('tiktok',120).replace(/^.*tiktok\.com\/@?/i,'').replace(/^@/,'').replace(/[/?].*$/,'')||null,facebook:t('facebook',200)||null,descripcion_servicios:t('descripcion_servicios',300)||null};
 if(d.nombre_completo.length<3)throw Error('Escribe tu nombre completo.');
 if(!/^[0-9A-Z]{5,15}$/.test(d.cedula))throw Error('La cédula o pasaporte debe tener entre 5 y 15 letras o números.');
 if(!/^[0-9+ ()-]{7,20}$/.test(d.celular))throw Error('Escribe un celular válido.');
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo))throw Error('Escribe un correo válido.');
 if(d.direccion.length<5)throw Error('Escribe tu dirección.');
 if(!d.instagram||!/^[A-Za-z0-9._]{1,30}$/.test(d.instagram))throw Error('Escribe tu usuario de Instagram (por ejemplo @tumarca).');
 if(d.tiktok&&!/^[A-Za-z0-9._]{1,30}$/.test(d.tiktok))throw Error('Revisa tu usuario de TikTok.');
 if(d.nombre_comercial&&d.nombre_comercial.length<2)throw Error('Revisa el nombre comercial.');
 if(!tipos.includes(d.tipo_aliado_id))throw Error('Elige qué tipo de aliado eres.');
 if(sedes&&!sedes.includes(String(d.sede_principal)))throw Error('Elige la sede con la que trabajas.');
 if(!d.banco||!d.tipo_cuenta||!(isKeyType(d.tipo_cuenta)?!keyError(d.tipo_cuenta,d.numero_cuenta):/^[0-9A-Z-]{4,34}$/i.test(d.numero_cuenta))||d.titular_cuenta.length<3)throw Error(keyError(d.tipo_cuenta,d.numero_cuenta)||'Completa banco, tipo, número y titular de la cuenta.');
 return d;
}
