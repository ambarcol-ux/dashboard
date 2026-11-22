import {supabase} from '@/lib/supabase';

type Liquidacion={contrato:string;pagado:number;citas_sugeridas:number;citas:number;valor_cita:number;arreglos:number;retencion:number;devolver:number};
const cop=(n:number)=>`$${Math.round(Number(n)||0).toLocaleString('es-CO')}`;

/** Desistimiento con liquidación (cláusula de reembolso y desistimiento): asks the appointments used and the alterations already made,
 *  shows paid − retention = return, and saves it (public.desistimiento_registrar; it also cancels the contract if it is still active).
 *  Returns false when the user cancels. Throws the database message on error. */
export async function liquidarDesistimiento(contratoId:string,motivo:string):Promise<boolean>{
 const base=await supabase.rpc('desistimiento_calculo',{p_contrato:contratoId});
 if(base.error)throw Error(base.error.message);
 const l0=base.data as Liquidacion;
 const citasTxt=window.prompt(`Citas usadas por la clienta (0 a 3: primera vez, medidas, prueba final). Se retienen ${cop(l0.valor_cita)} por cada una.`,String(l0.citas_sugeridas));
 if(citasTxt===null)return false;
 const citas=Math.min(3,Math.max(0,Math.round(Number(citasTxt))));
 if(!Number.isFinite(citas))throw Error('Escribe un número de citas de 0 a 3.');
 const arrTxt=window.prompt('Valor de los arreglos ya hechos al vestido (0 si no hubo).',String(Math.round(l0.arreglos)));
 if(arrTxt===null)return false;
 const arreglos=Math.max(0,Number(arrTxt.replace(/\D/g,''))||0);
 const r=await supabase.rpc('desistimiento_calculo',{p_contrato:contratoId,p_citas:citas,p_arreglos:arreglos});
 if(r.error)throw Error(r.error.message);
 const l=r.data as Liquidacion;
 if(!window.confirm(`Liquidación ${l.contrato}\nPagado: ${cop(l.pagado)}\nRetención: ${cop(l.retencion)} (${l.citas} cita(s) × ${cop(l.valor_cita)} + arreglos ${cop(l.arreglos)})\nA devolver: ${cop(l.devolver)}\n\nLa devolución se registra después en Depósitos y devoluciones › Desistimientos, con su comprobante. ¿Confirmas?`))return false;
 const {error}=await supabase.rpc('desistimiento_registrar',{p_contrato:contratoId,p_motivo:motivo,p_citas:citas,p_arreglos:arreglos});
 if(error)throw Error(error.message);
 return true;
}
