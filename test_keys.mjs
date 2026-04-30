import fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = Object.fromEntries(envFile.split('\n').map(line => line.split('=')));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function check(table) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=*&limit=1`;
  const res = await fetch(url, { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } });
  const data = await res.json();
  if (data && data.length > 0) {
    console.log(`Table ${table} keys:`, Object.keys(data[0]));
  } else {
    console.log(`Table ${table} is empty or error:`, data);
  }
}
await check('traslados_bitacora');
await check('mantenimiento_bitacora');
