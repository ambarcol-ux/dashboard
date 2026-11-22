import type {SupabaseClient} from '@supabase/supabase-js';

/** The single address that receives internal ERP notices (allies, ERP news): Configuración › Parámetros › «Correo de
 *  notificaciones del ERP» (config_parametros.correo_notificaciones_erp). Empty when it is not set: then no notice is sent. */
export async function erpNoticeEmails(db:SupabaseClient):Promise<string[]>{
 const {data}=await db.from('config_parametros').select('valor').eq('clave','correo_notificaciones_erp').maybeSingle();
 const v=typeof data?.valor==='string'?data.valor.trim():'';
 return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)?[v]:[];
}
