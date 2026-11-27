import type {SupabaseClient} from '@supabase/supabase-js';
import {sendAllyEmail} from './ally-emails';

const SIN_SALDO=/credit balance|billing|insufficient.*credit|purchase credits/i;

/** The WhatsApp AI failed: if it is because the Anthropic account ran out of credit, mark it and email the owner (once every 6 h). */
export async function avisoSinSaldoIA(db:SupabaseClient,error:string){
 if(!SIN_SALDO.test(error))return;
 const {data:c}=await db.from('whatsapp_ia_config').select('ia_sin_saldo_at,ia_saldo_avisado_at,alerta_saldo_usuario').eq('id',1).maybeSingle();
 const ahora=new Date().toISOString();
 if(!c?.ia_sin_saldo_at)await db.from('whatsapp_ia_config').update({ia_sin_saldo_at:ahora}).eq('id',1);
 if(c?.ia_saldo_avisado_at&&Date.now()-Date.parse(c.ia_saldo_avisado_at)<6*3600000)return;
 await db.from('whatsapp_ia_config').update({ia_saldo_avisado_at:ahora}).eq('id',1);
 const {data:p}=c?.alerta_saldo_usuario?await db.from('profiles').select('email').eq('id',c.alerta_saldo_usuario).maybeSingle():{data:null};
 if(!p?.email)return;
 await sendAllyEmail(p.email,{subject:'⚠️ La IA de WhatsApp se quedó sin crédito',html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b"><h2 style="color:#b91c1c">La IA de WhatsApp dejó de responder</h2><p>La cuenta de Anthropic (Claude) que usa la IA de WhatsApp se quedó <b>sin crédito</b>. Las clientas que escriban no reciben respuesta automática hasta que recargues.</p><p><b>Recarga aquí:</b> <a href="https://console.anthropic.com/settings/billing">console.anthropic.com › Plans &amp; Billing</a>. Te recomendamos activar la recarga automática.</p><p>Mientras tanto, las asesoras deben responder los chats desde WhatsApp en el ERP.</p><p style="color:#71717a;font-size:12px">Este aviso se repite cada 6 horas mientras siga sin crédito.</p></div>`});
}
/** The AI answered: the credit problem is over. */
export async function finSinSaldoIA(db:SupabaseClient){
 await db.from('whatsapp_ia_config').update({ia_sin_saldo_at:null,ia_saldo_avisado_at:null}).eq('id',1).not('ia_sin_saldo_at','is',null);
}
