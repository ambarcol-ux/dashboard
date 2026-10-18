const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {visitMetrics,outcomeLabel,bogotaLocalToIso,nowBogotaLocal}=compile('lib/first-visits.ts');
const base={id:'x',updated_at:'',fecha:'2026-10-15',hora:'10:00:00',modalidad:'presencial',sede_id:'s',sede:'S',cliente_nombre:'A',telefono:'3000000000',email:'',motivo:'',responsable:null,contrato_id:null,numero_contrato:null,contrato_estado:null};
const rows=[
 {...base,estado:'asistio',contrato_id:'k',contrato_estado:'firmado'},
 {...base,estado:'no_asistio'},
 {...base,estado:'agendada'},
 {...base,origen:'vitrina',estado:'seguimiento',resultado_visita:'En seguimiento'},
 {...base,origen:'vitrina',estado:'asistio',contrato_id:'k2',contrato_estado:'firmado'},
 {...base,origen:'vitrina',estado:'no_cerro',resultado_visita:'No cerró'},
];
const m=visitMetrics(rows);
assert.equal(m.reservas,3);assert.equal(m.vitrinas,3);assert.equal(m.attended,4);assert.equal(m.closed,2);assert.equal(m.noShow,1);
assert.equal(m.conversion,50);assert.equal(m.conversionCitas,100);assert.equal(m.conversionVitrinas,33);
assert.equal(outcomeLabel(rows[3]),'Atendida · En seguimiento');assert.equal(outcomeLabel(rows[4]),'Cerró · contrato activo');assert.equal(outcomeLabel(rows[1]),'No asistió');
assert.equal(bogotaLocalToIso('2026-10-15T11:20'),'2026-10-15T16:20:00.000Z');assert.equal(bogotaLocalToIso('x'),null);
assert.equal(nowBogotaLocal(new Date('2026-10-16T02:30:00Z')),'2026-10-15T21:30');
console.log('PASS first-visit walk-ins: separate counts and conversion by origin, walk-in labels, Bogotá date-time');
