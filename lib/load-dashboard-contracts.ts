import type {SupabaseClient} from '@supabase/supabase-js';

type Row = Record<string, any>;
// Preserve contract fields used by actions; signatures are loaded only for PDF.
export const DASHBOARD_CONTRACT_COLUMNS = 'id,numero_contrato,estado,cliente_nombre,cliente_documento,cliente_email,fecha_evento,valor_total,anticipo,saldo,token_firma,url_pdf_firmado,created_at,sede,whatsapp,direccion,fecha_firma_cliente,tipo_evento,fecha_cita_medidas,fecha_prueba_final,fecha_entrega_envio,referencia_vestido_id,tipo_vestido,observaciones_vestido,accesorios,metodo_pago,valor_deposito,banco_deposito,tipo_cuenta_deposito,numero_cuenta_deposito,titular_cuenta_deposito,asesora_comercial,fecha_fotografia,fecha_maquillaje,lleva_retablo,lleva_book,total_arreglos,tipo_entrega,fecha_pre_xv,referencia_vestido,observaciones_arreglos,asesora,asesor,cliente_whatsapp,cliente_direccion,metodos_pago,estado_medidas,estado_prueba_final,estado_entrega,numero_factura,prexv_fotografo,prexv_maquilladora,prexv_locacion,fecha_firma,sede_id,factura_registrada_at,asesora_id,nombre_asesora,estado_retorno,vestido_id,estado_aprobacion,quinceanera_name,fecha_retorno_prevista,dias_mantenimiento_ajuste,fecha_disponibilidad_real,estado_fisico_prenda,estado_logistico,total_multas,autoriza_uso_imagen,vestidos_count,total_vestidos,cantidad_vestidos,entregado_prexv,fecha_entrega_prexv,entregado_evento,fecha_entrega_evento,es_alquiler_estrene,prexv_componentes,prexv_fotografo_agendado,prexv_maquilladora_agendada,prexv_locacion_confirmada,finalizado_at,bloqueo_especial_referencia,bloqueo_especial_fecha,bloqueo_especial_vestido_id,fechas_bloqueo_especial';

export async function loadContractSignature(client: SupabaseClient, id: string) {
  const {data, error} = await client.from('contratos').select('firma_base64').eq('id', id).single();
  if (error) throw error;
  if (!data) throw new Error('No se pudo consultar la firma del contrato.');
  return data.firma_base64;
}

export async function loadDashboardContracts(client: SupabaseClient, filters: {sedeId?: string; or?: string} = {}) {
  // A single queue bounds all requests, including relation pagination.
  let active = 0;
  const waiting: Array<() => void> = [];
  async function request(build: () => any): Promise<Row[]> {
    if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try {
      const {data, error} = await build();
      if (error) throw error;
      if (!data) throw new Error('No se pudieron consultar los contratos.');
      return data;
    } finally {
      const next = waiting.shift();
      if (next) next(); else active--;
    }
  }
  async function pages(build: () => any): Promise<Row[]> {
    const rows: Row[] = [];
    for (let offset = 0; ; offset += 100) {
      const data = await request(() => build().range(offset, offset + 99));
      rows.push(...data);
      if (data.length < 100) return rows;
    }
  }
  const buildContracts = () => {
    let query = client.from('contratos').select(DASHBOARD_CONTRACT_COLUMNS).order('created_at', {ascending: false}).order('id');
    if (filters.sedeId) query = query.eq('sede_id', filters.sedeId);
    if (filters.or) query = query.or(filters.or);
    return query;
  };
  const contracts: Row[] = [];
  for (let offset = 0; ; offset += 300) {
    const batches = await Promise.all([0,100,200].map(delta =>
      request(() => buildContracts().range(offset + delta, offset + delta + 99))));
    for (const batch of batches) {
      contracts.push(...batch);
      if (batch.length < 100) break;
    }
    if (batches.some(batch => batch.length < 100)) break;
  }
  const groups: Row[][] = [];
  for (let i = 0; i < contracts.length; i += 100) groups.push(contracts.slice(i, i + 100));
  const related = await Promise.all(groups.map(async batch => {
    const ids = batch.map(c => c.id);
    const read = (table: string, columns = '*') =>
      pages(() => client.from(table).select(columns).in('contrato_id', ids).order('id'));
    const [arreglos, items, entregas] = await Promise.all([
      read('arreglos'), read('contrato_items_vestidos'),
      // Evidence and delivery details are already fetched when opening a contract.
      read('entregas_bitacora', 'id,contrato_id'),
    ]);
    return {batch, arreglos, items, entregas};
  }));
  const dressIds = [...new Set(related.flatMap(group => group.items.map(i => i.vestido_id)).filter(Boolean))];
  const dressGroups: string[][] = [];
  for (let i = 0; i < dressIds.length; i += 100) dressGroups.push(dressIds.slice(i, i + 100));
  const dressRows = (await Promise.all(dressGroups.map(ids =>
    pages(() => client.from('vestidos').select('*').in('id', ids).order('id'))))).flat();
  const dresses = new Map(dressRows.map(row => [row.id, row]));
  return related.flatMap(({batch, arreglos, items, entregas}) => batch.map(contract => ({
    ...contract,
    arreglos: arreglos.filter(row => row.contrato_id === contract.id),
    items: items.filter(row => row.contrato_id === contract.id).map(row => ({...row, vestido: dresses.get(row.vestido_id) ?? null})),
    entregas: entregas.filter(row => row.contrato_id === contract.id),
  })));
}
