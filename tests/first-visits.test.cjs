const assert=require('node:assert/strict');const compile=require('./compile.cjs');
const {validateVisitInput,visitMetrics,visitOutcome}=compile('lib/first-visits.ts');
const valid={id:'12345678-1234-1234-1234-123456789000',sede:'12345678-1234-1234-1234-123456789001',fecha:'2026-10-20',hora:'18:00',modalidad:'presencial',nombre:'Test Client',telefono:'+57 3001234567',email:'cliente@example.com',consentimiento:true,comercial:false,tipoVestido:'Gala',documento:'9908886655'};
// Colombian mobile stored as 10 digits (+57 removed); WhatsApp adds 57 when sending.
assert.equal(validateVisitInput(valid).telefono,'3001234567');
assert.equal(validateVisitInput({...valid,nombre:'  María   José Gómez '}).nombre,'María José Gómez');
for(const nombre of ['4 pm','María','Ana 2','x y','3001234567'])assert.throws(()=>validateVisitInput({...valid,nombre}),undefined,nombre);
for(const telefono of ['6017001234','300123456','30012345678','4001234567'])assert.throws(()=>validateVisitInput({...valid,telefono}),undefined,telefono);
assert.throws(()=>validateVisitInput({...valid,email:'ana@gmial.com'}),/gmail\.com/);
for(const invalid of [{documento:''},{documento:'abc'},{documento:'1234'},{hora:'19:00'},{hora:'08:00'},{hora:'09:30'},{consentimiento:false},{website:'spam'},{telefono:'hi'},{nombre:' '},{email:'wrong'},{email:''},{email:'   '},{modalidad:'otra'},{tipoVestido:''},{tipoVestido:'Otro'}])assert.throws(()=>validateVisitInput({...valid,...invalid}));
const NOW=Date.parse('2026-10-21T12:00:00-05:00');
const base={estado:'asistio',fecha:'2026-10-15',hora:'10:00:00',contrato_id:null,contrato_estado:null,alquilo:null,posible_seguimiento:null};
assert.equal(visitOutcome({...base,contrato_id:'1',contrato_estado:'borrador'}),'contrato_pendiente');
assert.equal(visitOutcome({...base,contrato_id:'1',contrato_estado:'cancelado'}),'asistio');
const m=visitMetrics([base,{...base,estado:'no_cerro',alquilo:false,posible_seguimiento:false},{...base,estado:'no_asistio',alquilo:false,posible_seguimiento:true},{...base,contrato_id:'1',contrato_estado:'firmado'},{...base,alquilo:true},{...base,estado:'agendada'},{...base,estado:'agendada',fecha:'2026-10-30'},{...base,estado:'cancelada'}],NOW);
assert.equal(m.asistieron,4);assert.equal(m.alquilaron,2);assert.equal(m.noAlquilaron,1);assert.equal(m.sinResultado,1);assert.equal(m.noAsistieron,1);
assert.equal(m.sinAsistencia,1);assert.equal(m.porAtender,1);assert.equal(m.canceladas,1);assert.equal(m.seguimiento,1);assert.equal(m.conversion,50);assert.equal(m.total,8);
console.log('PASS: input validation, attendance and rental counted once each (contract or «Alquiló»), pending records and conversion');

for(const tipoVestido of ['Gala','Quince','Novia'])assert.equal(validateVisitInput({...valid,tipoVestido}).tipoVestido,tipoVestido);
for(const telefono of ['300.123.4567','+57 (300) 123-4567','300 123 4567'])assert.match(validateVisitInput({...valid,telefono}).telefono,/^\d{10,15}$/);
assert.throws(()=>validateVisitInput({...valid,telefono:'123'}),/Revisa tu celular/);
assert.throws(()=>validateVisitInput({...valid,consentimiento:false}),/casilla de autorización/);
assert.throws(()=>validateVisitInput({...valid,hora:''}),/hora disponible/);
assert.throws(()=>validateVisitInput({...valid,website:'autofill'}),/campos visibles/);
assert.throws(()=>validateVisitInput({...valid,email:''}),/correo electrónico válido/);
assert.equal(validateVisitInput({...valid,email:' Cliente@Example.com '}).email,'cliente@example.com');
console.log('PASS: email is required for first-visit bookings');
const {visitStatus,outcomeLabel}=compile('lib/first-visits.ts');
assert.equal(visitStatus({...base,alquilo:true},NOW),'alquilo');
assert.equal(visitStatus({...base,estado:'seguimiento',alquilo:false,posible_seguimiento:true},NOW),'no_alquilo');
assert.equal(visitStatus({...base,estado:'confirmada'},NOW),'sin_registrar');
assert.equal(visitStatus({...base,estado:'agendada',contrato_id:'k',contrato_estado:'borrador'},NOW),'alquilo');
assert.equal(outcomeLabel({...base,estado:'no_asistio',alquilo:false,posible_seguimiento:true},NOW),'No asistió · Posible seguimiento');
assert.equal(outcomeLabel(base,NOW),'Asistió · falta registrar si alquiló');
console.log('PASS: simple result labels and filters');

// La reserva exige responder sí o no a la información comercial.
{const {comercial,...sinRespuesta}=valid;void comercial;
 assert.throws(()=>validateVisitInput(sinRespuesta),/autorizas o no/);
 assert.equal(validateVisitInput({...valid,comercial:true}).comercial,true);
 assert.equal(validateVisitInput({...valid,comercial:false}).comercial,false);}
