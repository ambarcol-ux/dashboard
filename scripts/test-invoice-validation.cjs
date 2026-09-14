const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const sandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/invoice-validation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, sandbox);
const { requireInvoice, getInvoiceUpdate, INVOICE_REQUIRED_MESSAGE } = sandbox.exports;
for (const value of [undefined, null, '', ' ', '\t\n', '\u00a0', '\u2003', 0, {}, []]) {
  assert.throws(() => requireInvoice(value), { message: INVOICE_REQUIRED_MESSAGE });
}
for (const original of [null, '', '   ', 'FAC-123']) {
  assert.equal(Object.keys(getInvoiceUpdate(original, original)).length, 0);
}
assert.equal(Object.keys(getInvoiceUpdate('', null)).length, 0);
for (const value of ['', null, ' \t\n']) {
  assert.throws(() => getInvoiceUpdate(value, 'FAC-123'), { message: INVOICE_REQUIRED_MESSAGE });
}
assert.equal(requireInvoice('  FAC-123  '), 'FAC-123');
assert.equal(getInvoiceUpdate(' FAC-456 ', null).numero_factura, 'FAC-456');
assert.equal(getInvoiceUpdate(' FAC-456 ', 'FAC-123').numero_factura, 'FAC-456');
console.log('PASS: empty invoices rejected, valid invoices accepted, legacy unrelated edits preserved.');
