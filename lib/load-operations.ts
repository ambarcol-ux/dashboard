import type {SupabaseClient} from '@supabase/supabase-js';
import {DASHBOARD_CONTRACT_COLUMNS} from './load-dashboard-contracts';
import {collectPages} from './collect-pages';

/** Calendar and indicators need scalar fields, never signatures, photos or dress details. */
export async function loadOperationsIndex(client:SupabaseClient,sedeId?:string) {
  const contracts=await collectPages<Record<string,any>>((from,to)=>{
    let query=client.from('contratos').select(DASHBOARD_CONTRACT_COLUMNS).order('created_at',{ascending:false}).order('id').range(from,to);
    if(sedeId)query=query.eq('sede_id',sedeId);
    return query;
  });
  const care=new Map<string,Record<string,any>[]>();
  const ids=contracts.filter(c=>c.estado?.toLowerCase()==='mantenimiento').map(c=>c.id);
  for(let offset=0;offset<ids.length;offset+=100){
    const rows=await collectPages<Record<string,any>>((from,to)=>client.from('mantenimiento_bitacora')
      .select('id,contrato_id,vestido_id,tipo,tipo_mantenimiento,estado,completado')
      .in('contrato_id',ids.slice(offset,offset+100)).order('id').range(from,to));
    for(const row of rows)care.set(row.contrato_id,[...(care.get(row.contrato_id)||[]),row]);
  }
  return contracts.map(c=>({...c,mantenimientos:care.get(c.id)||[]}));
}
