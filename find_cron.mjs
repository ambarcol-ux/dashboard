import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const jobs = await prisma.$queryRaw`SELECT * FROM cron.job;`;
    console.log('--- pg_cron Jobs ---');
    console.log(jobs);
    
    const triggers = await prisma.$queryRaw`
      SELECT event_object_table AS table_name, trigger_name, event_manipulation AS event, action_statement AS query
      FROM information_schema.triggers
      WHERE event_object_table = 'contratos';
    `;
    console.log('\n--- Triggers en Contratos ---');
    console.log(triggers);
    
    // Check functions too
    const functions = await prisma.$queryRaw`
      SELECT routine_name, routine_definition 
      FROM information_schema.routines 
      WHERE routine_type = 'FUNCTION' AND routine_schema = 'public' AND routine_definition ILIKE '%finalizado%';
    `;
    console.log('\n--- Functions containing finalizado ---');
    console.log(functions);
    
  } catch (e) {
    console.error('Error connecting or querying:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
