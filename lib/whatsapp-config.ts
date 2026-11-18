import type {SupabaseClient} from '@supabase/supabase-js';

/** WhatsApp sending settings: Configuración › Integraciones › WhatsApp once tested («conectada»); otherwise the META_* variables in Vercel. */
export type WhatsappSettings={token:string;phoneNumberId:string;templateLang:string;confirmationLang:string;acceptedPhoneIds:string[];origen:'integracion'|'vercel';
 /** WhatsApp Business account (Configuración › Integraciones › WhatsApp, else META_WA_WABA_ID, else the 304's). */
 wabaId:string};
/** WhatsApp Business account of the 304 (same default as Integraciones › WhatsApp). */
export const DEFAULT_WABA='1276534877505186';
type Row={activo?:boolean;estado?:string;secreto?:string|null;config?:Record<string,unknown>}|null;

export function whatsappSettings(row:Row,env:NodeJS.ProcessEnv=process.env):WhatsappSettings{
 const envPhone=env.META_WA_PHONE_NUMBER_ID||'';
 const c=row?.config||{},phone=String(c.phone_number_id||'');
 if(row?.activo&&row.estado==='conectada'&&row.secreto&&/^\d+$/.test(phone)){
  const previous=Array.isArray(c.anteriores)?c.anteriores.map(String):[];
  return {token:row.secreto,phoneNumberId:phone,templateLang:String(c.idioma_plantillas||env.META_WA_TEMPLATE_LANG||'es_CO'),confirmationLang:String(c.idioma_confirmacion||env.META_WA_CONFIRMATION_LANG||'es'),
   acceptedPhoneIds:[...new Set([phone,...previous,envPhone].filter(Boolean))],origen:'integracion',wabaId:String(c.waba_id||env.META_WA_WABA_ID||DEFAULT_WABA)};
 }
 return {token:env.META_WA_TOKEN||'',phoneNumberId:envPhone,templateLang:env.META_WA_TEMPLATE_LANG||'es_CO',confirmationLang:env.META_WA_CONFIRMATION_LANG||'es',acceptedPhoneIds:envPhone?[envPhone]:[],origen:'vercel',wabaId:env.META_WA_WABA_ID||DEFAULT_WABA};
}

/** Reads the integration (service role only) and falls back to Vercel when it is missing or not tested. */
export async function loadWhatsappSettings(db:SupabaseClient,env:NodeJS.ProcessEnv=process.env){
 try{const {data,error}=await db.rpc('integracion_whatsapp_servidor');return whatsappSettings(error?null:(data as Row),env);}
 catch{return whatsappSettings(null,env);}
}
