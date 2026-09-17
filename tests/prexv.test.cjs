const assert=require('node:assert/strict');
const compile=require('./compile.cjs');
const pre=compile('lib/prexv.ts'),cal=compile('lib/contract-calendar.ts'),edit=compile('lib/calendar-edit.ts');
const base={id:'qa',numero_contrato:'QA',cliente_nombre:'Prueba',tipo_evento:'Evento',fecha_pre_xv:'2026-09-15',fecha_fotografia:'2026-09-15T10:00:00-05:00',fecha_maquillaje:'2026-09-15T08:00:00-05:00'};
for(let mask=0;mask<8;mask++) {
 const selected=pre.prexvServices.filter((s,i)=>mask&(1<<i));
 const row={...base,prexv_componentes:selected.map(s=>s.id)};
 assert.equal(pre.prexvPending(row).length,selected.length);
 const events=cal.contractEvents([row]);
 assert.equal(events.some(e=>e.field==='fecha_fotografia'),Boolean(mask&1));
 assert.equal(events.some(e=>e.field==='fecha_maquillaje'),Boolean(mask&2));
 for(const s of selected){row[s.name]='Proveedor';row[s.confirmed]=true;}
 assert.equal(pre.prexvPending(row).length,0);
 assert.equal(pre.includedPrexv(row).length,selected.length);
}
assert.equal(pre.needsPrexvReview(base),true);
assert.equal(pre.prexvPending(base).length,1);
assert.equal(cal.contractEvents([base]).length,3);
assert.equal(pre.needsPrexvReview({tipo_evento:'Evento'}),false);
assert.equal(pre.prexvPending({prexv_componentes:['maquillaje'],prexv_maquilladora:'Ana'})[0],'Maquilladora agendada');
const fallback=cal.contractEvents([{...base,fecha_fotografia:null,fecha_maquillaje:null,prexv_componentes:['maquillaje']}]);
assert.equal(fallback.find(e=>e.field==='fecha_maquillaje').date,'2026-09-15');
for(const invalid of [{prexv_componentes:['foo']},{prexv_componentes:['fotos','fotos']},{prexv_componentes:'fotos'},{prexv_fotografo_agendado:'true'},{prexv_componentes:null}])assert.throws(()=>edit.validateCalendarPatch(invalid));
assert.equal(edit.validateCalendarPatch({prexv_maquilladora_agendada:true}).prexv_maquilladora_agendada,true);
console.log('PASS: eight combinations, included-only calendar milestones and confirmations, legacy review, date fallback, invalid payloads');
