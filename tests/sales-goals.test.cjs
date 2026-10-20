const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const g=compile('lib/sales-goals.ts');
// Ejemplo de la guía: Villavicencio, octubre 2026
assert.equal(g.baseDailyGoal({meta:50000000,dias_operativos:26}),1923077);
assert.equal(g.todayGoal({meta:50000000,vendido_hasta_ayer:31200000,dias_restantes:11}),1709091);
assert.equal(g.todayGoal({meta:50000000,vendido_hasta_ayer:60000000,dias_restantes:3}),0);
assert.equal(g.todayGoal({meta:50000000,vendido_hasta_ayer:0,dias_restantes:0}),null);
assert.equal(g.progress({meta:50000000,vendido:31200000}),62.4);
assert.equal(g.agingBucket({saldo:100,dias:30}),'al_dia');assert.equal(g.agingBucket({saldo:100,dias:31}),'mas30');
assert.equal(g.agingBucket({saldo:100,dias:91}),'mas90');assert.equal(g.agingBucket({saldo:100,dias:121}),'mas120');assert.equal(g.agingBucket({saldo:0,dias:200}),'pagada');
const rows=[{saldo:1100000,dias:132},{saldo:1500000,dias:97},{saldo:1200000,dias:38},{saldo:1400000,dias:2},{saldo:0,dias:15}];
assert.equal(g.overdueBalance(rows),3800000);
const csv=g.receivablesCsv([{numero_contrato:'CT-1',cliente:'Ana; B',sede:'Pereira',fecha:'2026-10-01',factura:null,recibo:'RC-1',valor:10,recaudado:5,saldo:5,dias:40}]);
assert(csv.includes('"Ana; B"'));assert(csv.includes('RC-1'));assert(csv.includes('Vencida +30'));
console.log('PASS: sales goals (base/today goal from the guide example) and receivables aging');
