const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/deposits.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod.exports,require,Intl});const {depositSummary,movementHistory}=mod.exports;
const c={id:'c1',valor_deposito:300000};const r={id:'r1',contrato_id:'c1',monto_devuelto:100000,monto_descuento:10000,estado:'completado',fecha_devolucion:'2026-09-13'};
assert.equal(depositSummary({...c,valor_deposito:0},[]).status,'Sin depósito');assert.equal(depositSummary(c,[r]).available,190000);assert.equal(depositSummary(c,[r]).status,'Por devolver');assert.equal(depositSummary(c,[r,{...r,id:'r2',monto_devuelto:190000,monto_descuento:0}]).status,'Liquidado');assert.equal(depositSummary(c,[{...r,estado:'cancelado'}]).available,300000);assert.equal(depositSummary(c,[{...r,contrato_id:'c2'}]).available,300000);assert.equal(depositSummary(c,[{...r,monto_devuelto:400000}]).status,'Revisar saldo');assert.equal(depositSummary({...c,valor_deposito:.3},[{...r,monto_devuelto:.1,monto_descuento:.2}]).available,0);
const m={id:'m1',contrato_id:'c1',tipo:'devolucion',monto:100000,descuento:10000,fecha:'2026-09-13',metodo:'Transferencia',devolucion_id:'r1'};assert.equal(movementHistory(c,[r],[m]).length,1);assert.equal(movementHistory(c,[r],[]).length,1);
console.log('PASS: zero-deposit contracts, partial/refunded balance, deductions, cancelled and unrelated returns, cents, legacy history deduplication.');

const {needsDepositReceipt}=mod.exports;
assert.equal(needsDepositReceipt(c,[],[]),true);
assert.equal(needsDepositReceipt({...c,valor_deposito:0},[],[]),false);
assert.equal(needsDepositReceipt(c,[{...m,tipo:'ingreso',monto:100000,comprobante_path:'receipt'}],[]),true);
assert.equal(needsDepositReceipt(c,[{...m,tipo:'ingreso',monto:300000,comprobante_path:'receipt'}],[]),false);
assert.equal(needsDepositReceipt(c,[],[{contrato_id:c.id}]),false);
assert.equal(needsDepositReceipt(c,[],[{contrato_id:'other'}]),true);
console.log('PASS: existing unreceipted deposit opens receipt-only flow; zero, documented and mixed deposits classified correctly.');
