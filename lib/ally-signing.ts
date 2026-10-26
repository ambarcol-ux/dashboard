import {createHash} from 'node:crypto';
import type {publicServerClient} from './public-db';
import {ALLY_CONTRACT_VERSION,DATA_AUTHORIZATION,agreementDate,allyContractText,fillAgreement,missingConfig,type AllyContractConfig,type AllyProfile,type ContractSection} from './ally-contract-text';
import {allyAgreementPdf} from './ally-pdf';
import {allyAdminNoticeEmail,allySignedEmail,sendAllyEmail} from './ally-emails';

type Db=ReturnType<typeof publicServerClient>;
export type AllyAgreement={version:number;secciones:ContractSection[]}|null;

/** Agreement the ally signs: the latest uploaded Word (fields filled) or the built-in text; null when neither is ready. */
export async function loadAgreement(db:Db){
 const [{data:acuerdo,error:e1},{data:config,error:e2}]=await Promise.all([
  db.from('acuerdos_aliado').select('version,secciones').order('version',{ascending:false}).limit(1).maybeSingle(),
  db.from('aliados_contrato_config').select('*').eq('id',1).maybeSingle(),
 ]);
 if(e1||e2)throw Error('UNAVAILABLE');
 return {acuerdo:acuerdo as AllyAgreement,config:config as AllyContractConfig|null,ready:!!acuerdo||!missingConfig(config).length};
}
export function agreementText(a:{acuerdo:AllyAgreement;config:AllyContractConfig|null},p:AllyProfile&{tipo:string},at:Date):ContractSection[]{
 return a.acuerdo?[...fillAgreement(a.acuerdo.secciones,{nombre:p.nombre,cedula:p.cedula,tipo:p.tipo,fecha:agreementDate(at)}),DATA_AUTHORIZATION]:allyContractText(a.config as AllyContractConfig,p,at,[DATA_AUTHORIZATION]);
}

/** Saves the signature, the signed PDF and the data authorization; the ally becomes Pendiente and administration is notified. */
export async function finishAllySigning(db:Db,ally:{id:string;nombre:string;cedula:string;correo:string;tipo:string},texto:ContractSection[],firma:string,version:string,profile:AllyProfile,request:Request,now:Date){
 const hash=createHash('sha256').update(JSON.stringify(texto)).update(firma).digest('hex'),codigo=hash.slice(0,12).toUpperCase();
 const {error}=await db.from('contratos_aliado').insert({aliado_id:ally.id,version,texto,datos:profile,firma_base64:firma,fecha_firma:now.toISOString(),hash,
  ip:(request.headers.get('x-forwarded-for')||'').split(',')[0].trim().slice(0,60)||null,user_agent:(request.headers.get('user-agent')||'').slice(0,300)||null});
 if(error)return {error:error.code==='23505'?'Este contrato ya fue firmado.':'No se pudo guardar la firma. Intenta nuevamente.',status:error.code==='23505'?409:503};
 const pdf=allyAgreementPdf(texto,firma,`Firmado digitalmente por ${ally.nombre} (C.C. ${ally.cedula}) el ${now.toLocaleString('es-CO',{timeZone:'America/Bogota'})} · Versión ${version} · Código de verificación ${codigo}`);
 const pdfPath=`${ally.id}/acuerdo/${codigo}.pdf`;
 const {error:up}=await db.storage.from('aliados_documentos').upload(pdfPath,pdf,{contentType:'application/pdf',upsert:true});
 await db.from('aliados').update({estado:'pendiente',acuerdo_version:version,datos_autorizados_at:now.toISOString(),datos_texto_version:ALLY_CONTRACT_VERSION,acuerdo_pdf_path:up?null:pdfPath}).eq('id',ally.id).in('estado',['pendiente_firma','pendiente']);
 const origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN?.replace(/\/$/,'')||new URL(request.url).origin;
 const {data:admins}=await db.from('profiles').select('email').eq('rol','admin').eq('activo',true);
 await Promise.all([
  sendAllyEmail(ally.correo,allySignedEmail(ally.nombre),[{filename:`Acuerdo-aliado-${codigo}.pdf`,content:pdf}]),
  sendAllyEmail((admins||[]).map(a=>a.email).filter(Boolean) as string[],allyAdminNoticeEmail(ally.nombre,ally.tipo,ally.cedula,`${origin}/dashboard/aliados-directos`)),
 ]);
 return {codigo};
}
