const assert=require('node:assert/strict');const compile=require('./compile.cjs');
const {validateVisitInput,visitMetrics,visitOutcome}=compile('lib/first-visits.ts');
const valid={id:'12345678-1234-1234-1234-123456789000',sede:'12345678-1234-1234-1234-123456789001',fecha:'2026-10-20',hora:'18:00',modalidad:'presencial',nombre:'Test Client',telefono:'+57 3001234567',email:'',consentimiento:true,tipoVestido:'Gala',documento:'9908886655'};
assert.equal(validateVisitInput(valid).telefono,'573001234567');
for(const invalid of [{documento:''},{documento:'abc'},{documento:'1234'},{hora:'19:00'},{hora:'08:00'},{hora:'09:30'},{consentimiento:false},{website:'spam'},{telefono:'hi'},{nombre:' '},{email:'wrong'},{modalidad:'otra'},{tipoVestido:''},{tipoVestido:'Otro'}])assert.throws(()=>validateVisitInput({...valid,...invalid}));
const base={estado:'asistio',contrato_id:null,contrato_estado:null};
assert.equal(visitOutcome({...base,contrato_id:'1',contrato_estado:'borrador'}),'contrato_pendiente');
assert.equal(visitOutcome({...base,contrato_id:'1',contrato_estado:'cancelado'}),'asistio');
const m=visitMetrics([base,{...base,estado:'no_cerro'},{...base,estado:'no_asistio'},{...base,contrato_id:'1',contrato_estado:'firmado'},{...base,contrato_id:'2',contrato_estado:'borrador'},{...base,estado:'agendada'}]);
assert.equal(m.closed,1);assert.equal(m.attended,4);assert.equal(m.lost,1);assert.equal(m.drafts,1);assert.equal(m.noShow,1);assert.equal(m.conversion,25);
console.log('PASS: input validation, draft vs signed conversion, cancellation and non-attendance metrics');

for(const tipoVestido of ['Gala','Quince','Novia'])assert.equal(validateVisitInput({...valid,tipoVestido}).tipoVestido,tipoVestido);
