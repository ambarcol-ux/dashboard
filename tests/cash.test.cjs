const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {expectedCash,cashDifference,parseCashAmount,cashReceiptPath,siteTotals,CASH_CATEGORIES,accountsFor,needsAccount,accountLabel,editSummary}=compile('lib/cash.ts');
assert.equal(expectedCash(70000,100000.1,20000.2),149999.9);
assert.equal(cashDifference(70000,80000),-10000);
assert.equal(parseCashAmount('150.000'),150000);
assert.equal(parseCashAmount('$ 1.250.000'),1250000);
assert.equal(parseCashAmount('150000,50'),150000.5);
assert.equal(parseCashAmount('99.5'),99.5);
for(const bad of ['','0','-5','abc','1e5','12.345,678'])assert.equal(parseCashAmount(bad),null,bad);
assert.equal(cashReceiptPath('s','2026-10-14','i','image/jpeg'),'s/2026-10-14/i.jpg');
assert.throws(()=>cashReceiptPath('s','d','i','text/html'));
const t=siteTotals([{ingresos:100.1,egresos:20,diferencia:-5,dias_con_movimientos_sin_cierre:1},{ingresos:0.2,egresos:0,diferencia:0,dias_con_movimientos_sin_cierre:2}]);
assert.equal(t.ingresos,100.3);assert.equal(t.pendientes,3);assert.equal(t.diferencia,-5);
assert(CASH_CATEGORIES.egreso.includes('Consignación a banco'));
assert(CASH_CATEGORIES.ingreso.includes('Base de caja')&&!CASH_CATEGORIES.ingreso.includes('Depósito en garantía')&&!CASH_CATEGORIES.egreso.includes('Devolución de depósito'));
const acc=[{id:'c1',nombre:'Caja menor Bogotá',tipo:'efectivo',sede_id:'b',activo:true},{id:'c2',nombre:'Caja menor Pereira',tipo:'efectivo',sede_id:'p',activo:true},
 {id:'k1',nombre:'Bancolombia ahorros',tipo:'banco',banco:'Bancolombia',numero:'0012345678',sede_id:null,activo:true},{id:'k2',nombre:'Nequi Pereira',tipo:'billetera',sede_id:'p',activo:true},{id:'k3',nombre:'Viejo',tipo:'banco',sede_id:null,activo:false}];
const ids=(r)=>JSON.stringify(r.map(a=>a.id));
assert.equal(ids(accountsFor('Efectivo',acc,'b')),'["c1"]');
assert.equal(ids(accountsFor('Transferencia',acc,'b')),'["k1"]');
assert.equal(ids(accountsFor('Transferencia',acc,'p')),'["k1","k2"]');
assert.equal(needsAccount('Transferencia',accountsFor('Transferencia',acc,'b')),true);
assert.equal(needsAccount('Otro',accountsFor('Otro',acc,'b')),false);
assert.equal(needsAccount('Tarjeta',[]),false);
assert.equal(accountLabel(acc[2]),'Bancolombia ahorros · ****5678');
assert.equal(accountLabel({nombre:'Ahorros',banco:'Davivienda',numero:null}),'Ahorros · Davivienda');
assert.deepEqual([...editSummary({anterior:{medio:'Transferencia',valor:845000,cuenta:null,descripcion:'a'},nuevo:{medio:'Efectivo',valor:844000,cuenta:'Caja menor',descripcion:'a'}},v=>'$'+v)],
 ['Medio: Transferencia → Efectivo','Valor: $845000 → $844000','Cuenta: — → Caja menor']);
console.log('PASS cash: expected cash and differences in cents, amount parsing (COP formats), receipt paths, site totals, destination accounts, edit summaries');
