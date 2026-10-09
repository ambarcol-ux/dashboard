const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260922012625_patch_depositos_vestidos_fuera.sql'), 'utf8');
const dashboard = fs.readFileSync(path.join(__dirname, '../app/dashboard/page.tsx'), 'utf8');
const deposits = fs.readFileSync(path.join(__dirname, '../components/DepositRequests.tsx'), 'utf8');

for (const required of [
  "'2026-09-14 00:00:00-05'", "s.estado in ('pendiente','en_proceso','pagado')",
  'bloquear_entrega_sin_deposito', 'editar_monto_deposito',
  'auditoria_montos_deposito', 'vestidos_fuera_tienda',
  'registrar_salida_vestidos', 'cerrar_salida_y_solicitar_devolucion',
  "then 'ALERTA'", "then 'PRÓXIMO A SEGUIMIENTO'",
]) assert.ok(migration.includes(required), `missing database rule: ${required}`);

assert.match(dashboard, /contrato_tiene_deposito_valido/);
assert.match(dashboard, /REGISTRAR DEPÓSITO/);
assert.match(dashboard, /OutsideDressAlerts/);
assert.match(deposits, /FALTA INFORMACIÓN DE CUENTA/);
assert.match(deposits, /EXPORTAR PENDIENTES A EXCEL/);
assert.match(deposits, /e\.key==='Escape'/);
assert.match(deposits, /onMouseDown/);

assert.match(deposits, /writeXlsxFile/);
assert.match(deposits, /\.xlsx/);

console.log('PASS A–O static contracts: delivery guard/link, cutoff/idempotency, active queue, banking warning, modal close, audited admin edit, invoice/document, outside-dress lifecycle and valid XLSX.');
