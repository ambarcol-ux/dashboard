const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {allyRegistration,vipPassRequest,allySlug}=compile('lib/ally-validation.ts');
const {legacyApiAllowed}=compile('lib/legacy-api-key.ts');
const {validSignature,UUID_RE}=compile('lib/public-db.ts',{'@supabase/supabase-js':{createClient:()=>({})}});
// ally sign-up: server builds the record, never trusts commission/state from the browser
const ally=allyRegistration({marca:'  Maquillaje Pró BQ ',contacto:'Ana',telefono:'300 123 4567',correo:'ANA@X.CO',aceptaTerminos:true,porcentaje_comision:50,estado:'Inactivo'});
assert.equal(ally.slug_unico,'maquillaje-pro-bq');assert.equal(ally.correo,'ana@x.co');assert.equal(ally.porcentaje_comision,0);assert.equal(ally.estado,'Activo');
assert.throws(()=>allyRegistration({marca:'X Y',contacto:'Ana',telefono:'3001234567',correo:'a@x.co',aceptaTerminos:false}));
assert.throws(()=>allyRegistration({marca:'Marca',contacto:'Ana',telefono:'abc',correo:'a@x.co',aceptaTerminos:true}));
assert.throws(()=>allyRegistration({marca:'!!!',contacto:'Ana',telefono:'3001234567',correo:'a@x.co',aceptaTerminos:true}));
assert.equal(allySlug('--Hola  Mundo--'),'hola-mundo');
// VIP pass request
assert.equal(vipPassRequest({nombre:'Sofía',telefono:'3001234567',correo:'s@x.co',fechaEvento:'2027-01-10',consentimiento:true,comercial:false},'2026-10-14').fecha,'2027-01-10');
assert.throws(()=>vipPassRequest({nombre:'Sofía',telefono:'3001234567',correo:'s@x.co',fechaEvento:'2027-01-10'},'2026-10-14'),/autorización/);
assert.throws(()=>vipPassRequest({nombre:'Sofía',telefono:'3001234567',correo:'s@x.co',fechaEvento:'2027-01-10',consentimiento:true},'2026-10-14'),/comercial/);
assert.throws(()=>vipPassRequest({nombre:'Sofía',telefono:'3001234567',correo:'s@x.co',fechaEvento:'2026-01-10'},'2026-10-14'));
assert.throws(()=>vipPassRequest({nombre:'S',telefono:'3001234567',correo:'s@x.co',fechaEvento:'2027-01-10'},'2026-10-14'));
// signatures and ids
assert(validSignature('data:image/png;base64,AAAA'));assert(!validSignature('data:text/html,<script>'));assert(!validSignature('data:image/png;base64,'+'A'.repeat(1_600_000)));
assert(UUID_RE.test('17841f68-ffc5-45c8-92d9-ec2f5fbfd15b'));assert(!UUID_RE.test("1' or 1=1"));
// legacy appointment API stays closed without a strong secret
const req=k=>new Request('https://x/api/citas/agendar',{headers:k?{'x-ambar-api-key':k}:{}});
assert(!legacyApiAllowed(req('abc'),{}));assert(!legacyApiAllowed(req('short'),{CITAS_API_SECRET:'short'}));
const s='s'.repeat(32);assert(legacyApiAllowed(req(s),{CITAS_API_SECRET:s}));assert(!legacyApiAllowed(req(s+'x'),{CITAS_API_SECRET:s}));
console.log('PASS public routes: ally/VIP validation on the server, signature limits, uuid guard, closed legacy API');
