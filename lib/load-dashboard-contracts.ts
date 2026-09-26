import type {SupabaseClient} from '@supabase/supabase-js';

type Row = Record<string, any>;
// Bound each request and keep joins out of the database's JSON aggregation.
// Every read uses the caller's authenticated client and existing RLS policies.
async function pages(build: () => any): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 100) {
    const {data, error} = await build().range(offset, offset + 99);
    if (error) throw error;
    if (!data) throw new Error('No se pudieron consultar los contratos.');
    rows.push(...data);
    if (data.length < 100) return rows;
  }
}

export async function loadDashboardContracts(client: SupabaseClient, filters: {sedeId?: string; or?: string} = {}) {
  const contracts = await pages(() => {
    let query = client.from('contratos').select('*').order('created_at', {ascending: false}).order('id');
    if (filters.sedeId) query = query.eq('sede_id', filters.sedeId);
    if (filters.or) query = query.or(filters.or);
    return query;
  });
  const result: Row[] = [];
  for (let offset = 0; offset < contracts.length; offset += 100) {
    const batch = contracts.slice(offset, offset + 100);
    const ids = batch.map(c => c.id);
    const read = (table: string) => pages(() => client.from(table).select('*').in('contrato_id', ids).order('id'));
    const [arreglos, items, entregas] = await Promise.all([read('arreglos'), read('contrato_items_vestidos'), read('entregas_bitacora')]);
    const dressIds = [...new Set(items.map(i => i.vestido_id).filter(Boolean))];
    const dresses = new Map<string, Row>();
    for (let i = 0; i < dressIds.length; i += 100) {
      const rows = await pages(() => client.from('vestidos').select('*').in('id', dressIds.slice(i, i + 100)).order('id'));
      rows.forEach(row => dresses.set(row.id, row));
    }
    for (const contract of batch) result.push({
      ...contract,
      arreglos: arreglos.filter(row => row.contrato_id === contract.id),
      items: items.filter(row => row.contrato_id === contract.id).map(row => ({...row, vestido: dresses.get(row.vestido_id) ?? null})),
      entregas: entregas.filter(row => row.contrato_id === contract.id),
    });
  }
  return result;
}
