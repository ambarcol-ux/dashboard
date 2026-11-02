const test=require('node:test'),assert=require('node:assert');
const compile=require('./compile.cjs');
const {renderMail,catalogLink,catalogType}=compile('lib/email-marketing.ts');
const {parseEvents}=compile('lib/email-providers.ts');

test('el correo reemplaza variables, quita las vacías y siempre lleva el enlace de baja',()=>{
 const m=renderMail('{nombre}, hola','Hola, {nombre}.\n\nMira: {catalogo}\n\n{condiciones}\n\nFin',{nombre:'Ana',catalogo:'https://erp.x/bogota/xv-anos?o=correo-promocion',condiciones:''},'https://erp.x/autorizacion/t');
 assert.equal(m.asunto,'Ana, hola');
 assert.match(m.texto,/^Hola, Ana\.\n\nMira: https:\/\/erp\.x\/bogota\/xv-anos/);
 assert.doesNotMatch(m.texto,/\n{3,}/);
 assert.match(m.texto,/https:\/\/erp\.x\/autorizacion\/t$/);
 assert.match(m.html,/href="https:\/\/erp\.x\/autorizacion\/t"/);
 assert.doesNotMatch(renderMail('x','<script>{nombre}</script> texto largo',{nombre:'A'},'u').html,/<script>/);
});

test('el catálogo se arma con la sede y el tipo de la cita',()=>{
 assert.equal(catalogType('Quince'),'XV Años');
 assert.equal(catalogLink('https://erp.x','Bogotá','Quince','correo-seguimiento'),'https://erp.x/bogota/xv-anos?o=correo-seguimiento');
 assert.equal(catalogLink('https://erp.x','Pereira','','o'),'');
});

test('la baja y el spam de cada proveedor se reconocen',()=>{
 assert.equal(parseEvents('brevo',{event:'unsubscribed',email:'A@x.com'})[0].baja,true);
 assert.equal(parseEvents('brevo',{event:'unsubscribe',email:'a@x.com'})[0].email,'a@x.com');
 assert.equal(parseEvents('brevo',{event:'spam',email:'a@x.com'})[0].baja,true);
 assert.equal(parseEvents('brevo',{event:'opened',email:'a@x.com'})[0].baja,false);
 assert.equal(parseEvents('sendgrid',[{event:'unsubscribe',email:'a@x.com'},{event:'open',email:'a@x.com'}]).filter(e=>e.baja).length,1);
 assert.equal(parseEvents('mailjet',{event:'unsub',email:'a@x.com'})[0].baja,true);
});
