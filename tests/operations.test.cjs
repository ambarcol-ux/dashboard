const assert = require('node:assert/strict');
const { operationGroup, operationGroupsForContract, matchesOperation } = require('./compile.cjs')('lib/operations.ts');
const { contractEvents } = require('./compile.cjs')('lib/contract-calendar.ts');
const base = { id:'a', numero_contrato:'COPIA-001', cliente_nombre:'María', estado:'firmado', sede_id:'barranquilla', sede:'Barranquilla', entregas:[] };
assert.equal(operationGroup(base), 'pending');
assert.equal(operationGroup({...base,entregas:[{id:'delivery'}]}), 'pending');
for (const [estado, expected] of [['mantenimiento','unclassified'],['finalizado','history'],['anulado','cancelled'],['rechazado','cancelled']]) {
 assert.equal(operationGroup({...base,estado,entregas:[{id:'old-delivery'}]}), expected);
}
const filter = {search:'maria',sede:'barranquilla',group:'pending',prexv:false,type:''};
assert.equal(matchesOperation(base, filter,()=>false),true);
assert.equal(matchesOperation(base,{...filter,sede:'pereira'},()=>false),false);
assert.equal(matchesOperation({...base,sede:'Pereira'},filter,()=>false),true);
assert.equal(matchesOperation(base,{...filter,prexv:true},()=>false),false);
assert.equal(matchesOperation(base,{...filter,type:'fecha_evento'},()=>false),false);
assert.equal(matchesOperation({...base,fecha_evento:'2026-09-28'},{...filter,type:'fecha_evento'},()=>false),true);
const activities=contractEvents([{...base,fecha_evento:'2026-09-28',fecha_retorno_prevista:'2026-09-29'}]);
assert.equal(activities.length,2);
assert.equal(new Set(activities.map(e=>e.contract.id)).size,1);
assert.equal(contractEvents([base]).length,0);
console.log('PASS: delivered and closed states, site ID isolation, accented search, PRE-XV, date filters, unique contracts vs activities, undated contracts');

const searchable={...base,cliente_nombre:'María José Pérez',cliente_documento:'1.234.567.890',numero_factura:'FAC-2026-045'};
for(const search of ['maria jose','PÉREZ','FAC-2026-045','2026-045','1234567890','1.234.567.890',' 1234567 ']) assert.equal(matchesOperation(searchable,{...filter,search},()=>false),true,search);
for(const search of ['Ana','FAC-999','987654','---']) assert.equal(matchesOperation(searchable,{...filter,search},()=>false),false,search);
assert.equal(matchesOperation(searchable,{...filter,search:'1234567890',sede:'pereira'},()=>false),false);
assert.equal(matchesOperation({...base,cliente_documento:null},{...filter,search:'123456'},()=>false),false);
console.log('PASS: names, accents, partial invoices, formatted documents, null documents and site isolation');

const maintenance={...base,estado:'mantenimiento'};
const repair={tipo:'SASTRERÍA',estado:'en proceso',vestido_id:'a'};
const laundry={tipo:'LAVANDERÍA',estado:'en proceso',vestido_id:'b'};
assert.equal(operationGroup({...maintenance,mantenimientos:[laundry]}),'laundry');
assert.equal(operationGroup({...maintenance,mantenimientos:[repair]}),'care');
assert.equal(matchesOperation({...maintenance,mantenimientos:[laundry]},{...filter,group:'care'},()=>false),false);
assert.equal(operationGroup({...maintenance,mantenimientos:[{...repair,estado:'finalizado'},laundry]}),'laundry');
assert.equal(operationGroup({...maintenance,mantenimientos:[{...repair,completado:true}]}),'unclassified');
assert.equal(operationGroup({...maintenance,mantenimientos:[{tipo_mantenimiento:'Sastrería',completado:false}]}),'care');
assert.equal(operationGroupsForContract({...maintenance,mantenimientos:[repair,laundry]}).join(','),'care,laundry');
assert.equal(operationGroup({...maintenance,estado:'finalizado',mantenimientos:[repair]}),'history');
console.log('PASS: repair/laundry separation, closed history excluded, legacy types, unknown destinations and mixed contracts');

assert.equal(operationGroup({...base,estado:'entregado'}),'event');
assert.equal(operationGroup({...base,estado:'firmado',entregas:[{id:'old-signed-delivery'}]}),'pending');
