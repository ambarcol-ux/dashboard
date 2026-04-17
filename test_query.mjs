import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(envFile.split('\n').filter(Boolean).map(line => line.split('=')));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const searchTerm = 'M-01';
  // Try 1: Using PostgREST syntax with relation
  const { data, error } = await supabase
    .from('contratos')
    .select(`
      id,
      cliente_nombre,
      items:contrato_items_vestidos(
        vestido_id,
        vestido:vestidos(codigo)
      )
    `)
    .or(`cliente_nombre.ilike.%${searchTerm}%,contrato_items_vestidos.vestidos.codigo.ilike.%${searchTerm}%`)
    .limit(1);

  console.log('Result 1:', error || data);
}
test();
