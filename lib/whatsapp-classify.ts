import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';
import {aiClient} from './ai-usage';

/** WhatsApp con botones: the customer typed instead of tapping. If the last automatic message waiting for her answer (24 h) has
 *  buttons, the AI reads her text and, when it clearly matches one option, the ERP runs the same action as the button. */
const OPCIONES:Record<string,{pregunta:string;acciones:Record<string,string>}>={
 confirmacion:{pregunta:'¿Confirmas tu primera cita?',acciones:{cf_confirmo:'confirma que va a la cita',cf_cambiar:'quiere cambiar la fecha o la hora'}},
 recordatorio24:{pregunta:'Recordatorio de su cita de mañana: ¿nos confirmas que vienes?',acciones:{rc_confirmo:'confirma que va',rc_reagendar:'quiere cambiar la fecha o la hora',rc_no_puedo:'no puede ir o quiere cancelar'}},
 recordatorio2:{pregunta:'¡Hoy es tu cita!',acciones:{r2_ubicacion:'pide la dirección o cómo llegar',r2_cambiar:'quiere cambiar la hora o el día'}},
 confirmar_cancelacion:{pregunta:'¿Cancelamos tu cita?',acciones:{cc_si:'sí, que la cancelen',cc_no:'no, mantiene la cita'}},
 post_cita:{pregunta:'¿Cómo te fue en tu cita en Ámbar?',acciones:{pc_alquile:'fue a la cita y alquiló o separó un vestido',pc_no_decido:'fue a la cita pero aún no decide o no alquiló',pc_no_asisti:'no pudo ir a la cita'}},
 pregunta_alquiler:{pregunta:'¿Alquilaste tu vestido con Ámbar?',acciones:{pc_alquile:'sí alquiló',pc_no_alquile:'no alquiló'}},
 pregunta_motivo:{pregunta:'¿Cuál fue la principal razón por la que no alquilaste?',acciones:{mot_precio:'el precio',mot_no_vestido:'no encontró el vestido que buscaba',mot_otras_tiendas:'va a visitar otras tiendas',mot_consultar:'debe consultarlo con alguien',mot_fecha_evento:'por la fecha del evento',mot_talla_diseno:'talla, diseño o ajuste',mot_otro:'otro motivo que explica'}},
 satisfaccion:{pregunta:'¿Cómo te sentiste con la atención en Ámbar?',acciones:{sat_excelente:'excelente, encantada',sat_bien:'bien',sat_mejorar:'regular, mal o algo puede mejorar'}},
 satisfaccion_falla:{pregunta:'¿Qué podemos mejorar?',acciones:{fa_atencion:'la atención',fa_espera:'el tiempo de espera',fa_vestidos:'los vestidos',fa_precio:'el precio',fa_instalaciones:'las instalaciones',fa_otro:'otra cosa'}},
};

/** Returns true when the text was taken as the answer (the flow continues with its next message, so the chat AI does not answer). */
export async function classifyFlowReply(db:SupabaseClient,telefono:string,waId:string,texto:string){
 const t=texto.trim();if(!t||t.length>500)return false;
 const {data}=await db.rpc('flujo_pendiente_whatsapp',{p_tel:telefono});
 const p=((data||[]) as {provider_id:string;tipo:string}[])[0];const o=p&&OPCIONES[p.tipo];
 if(!o)return false;
 const ids=Object.keys(o.acciones);
 const r=await aiClient('whatsapp_clasificar').messages.create({model:'claude-haiku-5-5',max_tokens:100,output_config:{effort:'low',format:{type:'json_schema',schema:{type:'object',additionalProperties:false,required:['accion'],properties:{accion:{type:'string',enum:[...ids,'ninguna']}}}}},
  messages:[{role:'user',content:`Ámbar Couture (alquiler de vestidos) le envió a una clienta por WhatsApp: «${o.pregunta}». Opciones:\n${ids.map(id=>`- ${id}: ${o.acciones[id]}`).join('\n')}\n- ninguna: su mensaje no responde esa pregunta o no es claro (por ejemplo, pregunta otra cosa)\n\nLa clienta escribió: «${t}»\nElige la opción que corresponde a lo que dijo. Si hay duda, elige «ninguna».`}]});
 const b=r.content.find((x):x is Anthropic.TextBlock=>x.type==='text');
 const accion=(b?JSON.parse(b.text):{accion:'ninguna'}).accion as string;
 if(!ids.includes(accion))return false;
 const {data:ok,error}=await db.rpc('respuesta_whatsapp_primera_cita',{p_message_id:waId,p_context_id:p.provider_id,p_telefono:telefono,p_accion:accion});
 return !error&&ok===true;
}
