import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const client = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await client.rpc('get_triggers_or_run_sql', { query: "SELECT tgname, proname FROM pg_trigger JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid WHERE tgrelid = 'contratos'::regclass;" });
  if (error) {
    console.error("Error with rpc:", error);
    // Let's try querying pg_catalog via raw SQL if there's an endpoint or just fetch functions
    console.log("We might not have RPC access. Let's list functions if possible.");
  } else {
    console.log(data);
  }
}
run();
