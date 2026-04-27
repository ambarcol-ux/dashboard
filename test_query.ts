import { createClient } from '@supabase/supabase-js';
// @ts-ignore
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const searchTerm = 'M-01';
  let query = supabase
    .from('contratos')
    .select(`
      id,
      items:contrato_items_vestidos(
        vestido_id,
        vestido:vestidos(codigo)
      )
    `)
    .or(`cliente_nombre.ilike.%${searchTerm}%,cliente_documento.ilike.%${searchTerm}%,numero_contrato.ilike.%${searchTerm}%,contrato_items_vestidos.vestidos.codigo.ilike.%${searchTerm}%`)
    .limit(1);

  const { data, error } = await query;
  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('SUCCESS:', data);
  }
}
test();
