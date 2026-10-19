const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {appointmentEmail,visitTime}=compile('lib/first-visit-email.ts');
const url='https://erp.ambarcouture.com/reprogramar-primera-cita';
assert.equal(visitTime('15:00:00'),'3:00 p. m.');assert.equal(visitTime('09:00'),'9:00 a. m.');assert.equal(visitTime('12:00'),'12:00 p. m.');
const sites=[['Pereira','Carrera 17 #9-70','321 347 3757','573213473757'],['Villavicencio','Calle 15 #42-21','321 489 3891','573214893891'],['Barranquilla','Carrera 54 #84-95','310 211 9906','573102119906'],['Bogota','Carrera 15 #106-76','305 807 3210','573058073210']];
for(const [sede,dir,tel,wa] of sites){
 const m=appointmentEmail('reserva',{fecha:'2026-10-15',hora:'15:00:00',modalidad:'presencial',sede},'Andrés',url);
 assert.match(m.text,/^Hola, Andrés 👋/);assert.match(m.text,/presencial en Ámbar Couture/);assert.match(m.text,/está confirmada/);
 assert.match(m.text,/📅 Fecha: 15 de octubre de 2026/);assert.match(m.text,/🕒 Hora: 3:00 p\. m\./);
 assert(m.text.includes(dir));assert(m.text.includes(tel));assert(m.text.includes('https://wa.me/'+wa));assert(m.text.includes(url));
 assert.match(m.text,/vestido ideal/);assert(m.html.includes(dir.replace('#','#')));
}
let m=appointmentEmail('reserva',{fecha:'2026-10-15',hora:'15:00',modalidad:'virtual',sede:'Bogotá'},'Ana',url);
assert.match(m.text,/virtual con Ámbar Couture/);assert(!m.text.includes('Dirección'));assert.match(m.text,/Te enviaremos el enlace/);assert(m.text.includes('305 807 3210'));
m=appointmentEmail('confirmacion',{fecha:'2026-10-15',hora:'15:00',modalidad:'virtual',sede:'Bogotá',enlace_virtual:'https://meet.google.com/abc-defg-hij'},'Ana',url);
assert(m.text.includes('meet.google.com/abc-defg-hij'));
m=appointmentEmail('reprogramacion',{fecha:'2026-10-16',hora:'10:00',modalidad:'presencial',sede:'Pereira',anterior:{fecha:'2026-10-15',hora:'15:00',modalidad:'presencial',sede:'Pereira'}},'Ana <b>',url);
assert.match(m.text,/fue reprogramada/);assert.match(m.text,/Antes: 15 de octubre de 2026, 3:00 p\. m\./);assert(m.html.includes('Ana &lt;b&gt;'));assert(!m.html.includes('<b>'));
console.log('PASS: appointment emails per store (address, map, phone, WhatsApp, reschedule) and virtual');
