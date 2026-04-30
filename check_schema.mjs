import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('traslados_bitacora').select('*').limit(1);
  if (error) console.error(error);
  else console.log(data && data.length ? Object.keys(data[0]) : "Empty table, cannot infer schema this way.");
}
check();
