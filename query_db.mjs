import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://postgres:sb_secret_zMLvngS_C2Tsk1iC3CpCCw_iX0-uJ99@db.topldhogulsqfppbvwjw.supabase.co:5432/postgres"
});

async function main() {
  await client.connect();
  console.log("Connected to DB!");

  try {
    const res = await client.query("SELECT jobid, schedule, command, jobname FROM cron.job;");
    console.log("--- CRON JOBS ---");
    console.table(res.rows);

    const res2 = await client.query("SELECT routine_name, routine_definition FROM information_schema.routines WHERE routine_definition ILIKE '%finalizado%' OR routine_definition ILIKE '%3 days%';");
    console.log("--- FUNCTIONS ---");
    console.table(res2.rows);

  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await client.end();
  }
}
main();
