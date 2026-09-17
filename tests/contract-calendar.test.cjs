const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const {contractEvents,bogotaDay,milestoneTypes,calendarColumns}=require('./compile.cjs')('lib/contract-calendar.ts');
const base={id:'test-id',numero_contrato:'DEMO',cliente_nombre:'Cliente ficticia',estado:'pendiente',sede:'Demo',sede_id:null,quinceanera_name:null,vestido_id:null,referencia_vestido:null,tipo_evento:'Evento'};
assert.equal(bogotaDay('2026-09-13'),'2026-09-13');
assert.equal(bogotaDay('2026-09-14T02:30:00Z'),'2026-09-13');
assert.equal(bogotaDay('2026-02-30'),null);
assert.equal(contractEvents([{...base,fecha_cita_medidas:'2026-09-13',fecha_prueba_final:'2026-09-13'}]).length,2);
assert.equal(contractEvents([{...base,fecha_cita_medidas:null}]).length,0);
const every={...base,...Object.fromEntries(milestoneTypes.map(t=>[t.field,'2026-09-13']))};
assert.equal(contractEvents([every]).length,milestoneTypes.length);
for(const e of contractEvents([every])){assert.equal(e.href,'/dashboard?contratoId=test-id');assert.equal(e.time,null);}
console.log('PASS: date-only preservation, Bogotá timezone, null/invalid dates, all milestones and contract links');
