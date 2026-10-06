import type { OperationContract } from './operations';
import { bogotaDay } from './contract-calendar';

// Fictional data for the public design preview. Never read customer data here.
export const previewSites = [{ id:'demo-baq', nombre:'Barranquilla' }, { id:'demo-per', nombre:'Pereira' }];
export function previewContracts(): OperationContract[] {
  const today = bogotaDay(new Date().toISOString())!;
  const date = (offset:number) => { const d=new Date(today+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10); };
  return ['Cliente de muestra 01','Cliente de muestra 02','Cliente de muestra 03','Cliente de muestra 04','Cliente de muestra 05','Cliente de muestra 06','Cliente de muestra 07'].map((name,i)=>({
    id:'demo-'+i, numero_contrato:'DEMO-'+String(i+1).padStart(3,'0'), numero_factura:'F-DEMO-'+(i+1),
    cliente_nombre:name, quinceanera_name:null, sede:'Barranquilla', sede_id:'demo-baq',
    estado:['firmado','entregado','mantenimiento','mantenimiento','cancelado','borrador','finalizado'][i],
    mantenimientos:i===2?[{vestido_id:'demo-dress-2',tipo:'SASTRERÍA',estado:'en proceso',completado:false}]:i===3?[{vestido_id:'demo-dress-3',tipo:'LAVANDERÍA',estado:'en proceso',completado:false}]:[],
    vestido_id:null, referencia_vestido:'REF-DEMO-'+(i+1), tipo_evento:'Evento',
    cliente_documento:'DEMO-000'+i,cliente_whatsapp:'0000000000',cliente_email:'demo@example.invalid',cliente_direccion:'Dirección de ejemplo',anticipo:2000000,created_at:new Date().toISOString(),items:[],prendas:[],arreglos:[],
    fecha_cita_medidas:i===5?null:date(i-4),fecha_prueba_final:i===5?null:date(i-3),
    fecha_evento:i===5?null:date(i-1), fecha_entrega_envio:i===5?null:date(i-2),
    fecha_retorno_prevista:i===5?null:date(i+2), valor_total:2000000, saldo:0, entregas:[],
  }));
}
