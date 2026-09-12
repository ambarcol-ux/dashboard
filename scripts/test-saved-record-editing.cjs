const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const code = ts.transpileModule(fs.readFileSync('lib/saved-record-editing.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(code, sandbox);
const { canEditSavedRecords, getAdditionalContractUpdates, toEditingValue } = sandbox.exports;
assert.equal(canEditSavedRecords(null), false);
assert.equal(canEditSavedRecords({ email: 'rubenvaron239@gmail.com' }), false);
assert.equal(canEditSavedRecords({ user_metadata: { can_edit_saved_records: true } }), false);
assert.equal(canEditSavedRecords({ app_metadata: { can_edit_saved_records: 'true' } }), false);
assert.equal(canEditSavedRecords({ app_metadata: { can_edit_saved_records: true } }), true);
assert.equal(canEditSavedRecords({ email: 'dubian.h88@gmail.com' }), true);
const original = { valor_deposito: 500, fecha_pre_xv: '2026-09-15', token_firma: 'original' };
const updates = getAdditionalContractUpdates({ ...original, valor_deposito: '0', fecha_pre_xv: '', token_firma: 'tampered' }, original);
assert.equal(updates.valor_deposito, 0);
assert.equal(updates.fecha_pre_xv, null);
assert.equal('token_firma' in updates, false);
assert.throws(() => getAdditionalContractUpdates({ valor_deposito: -1 }, {}));
assert.throws(() => getAdditionalContractUpdates({ total_arreglos: 'invalid' }, {}));
assert.equal(toEditingValue('2026-09-15', 'date'), '2026-09-15');
const timestamp = '2026-09-15T15:30:00.000Z';
const input = toEditingValue(timestamp, 'datetime-local');
assert.equal(getAdditionalContractUpdates({ fecha_fotografia: input }, {}).fecha_fotografia, timestamp);
console.log('Saved-record permission, field whitelist, amounts, nullable dates and timezone round-trip: PASS');
