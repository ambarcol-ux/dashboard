const assert=require('node:assert/strict'),compile=require('./compile.cjs');
process.env.SUPABASE_SERVICE_ROLE_KEY='service-key-test';process.env.NEXT_PUBLIC_SUPABASE_URL='https://db.test';delete process.env.FIRST_VISIT_LINK_SECRET;
const lib=compile('lib/ally-contract.ts');
const id='22222222-2222-2222-2222-222222222222';
const config={id:1,representante:'Lina Polo',representante_cedula:'123',representante_ciudad_cedula:'Bogotá',nit:'900',direccion:'Cra 15',ciudad:'Bogotá',correo:'a@b.co',telefono:'300',deposito_por_vestido:300000,mora_por_dia:50000,clausula_penal:1000000,cuenta_redes:'ambar'};
let state;
const table=name=>({select:()=>({order:()=>({limit:()=>({maybeSingle:async()=>({data:state.acuerdo||null,error:null})})}),eq:()=>({eq:async()=>({data:[{email:'admin@x.co'}],error:null}),maybeSingle:async()=>({data:name==='aliados'?state.ally:name==='contratos_aliado'?state.signed:state.config,error:null})})}),
 insert:async row=>{if(state.signed)return {error:{code:'23505'}};state.signed={...row};return {error:null};},
 update:v=>({eq:()=>({in:async(_k,list)=>{state.updated={...v,desde:list};return {error:null};}})})});
const storage={from:()=>({upload:async(path,buf)=>{state.pdf={path,size:buf.length};return {error:null};}})};
const sent=[];
const signing=compile('lib/ally-signing.ts',{'node:crypto':require('node:crypto'),'./ally-contract-text':compile('lib/ally-contract-text.ts'),'./ally-pdf':{allyAgreementPdf:(t,f,pie)=>{state.pie=pie;return Buffer.alloc(2000);}},
 './ally-emails':{allySignedEmail:n=>({subject:'firmado '+n}),allyAdminNoticeEmail:n=>({subject:'nuevo '+n}),sendAllyEmail:async(to,m,att)=>{sent.push({to,subject:m.subject,adjuntos:(att||[]).length});return true;}}});
const api=compile('app/api/aliados/contrato/route.ts',{'@/lib/ally-signing':signing,'@/lib/public-db':{...compile('lib/public-db.ts'),publicServerClient:()=>({from:table,storage})},'@/lib/ally-contract':lib,'node:crypto':require('node:crypto')});
const req=body=>new Request('https://erp.test/api/aliados/contrato',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const token=lib.allyContractToken(id,Date.now()+60000,'service-key-test','directo');
assert(token.startsWith('d.'));assert.equal(lib.verifyAllyContractToken(token,'service-key-test').kind,'directo');
assert.equal(lib.verifyAllyContractToken(token.slice(2),'service-key-test'),null,'a direct token is not valid as a VIP token');
const firma='data:image/png;base64,AAAA';
(async()=>{
 state={ally:{id,nombre_completo:'Laura Méndez',cedula:'1121845230',celular:'3105550123',correo:'l@x.co',direccion:'Calle 38',estado:'pendiente_firma',sedes:{nombre:'Villavicencio'}},signed:null,config};
 let r=await api.POST(req({token,accion:'ver'}));let d=await r.json();assert.equal(d.directo,true);assert.equal(d.aliado.cedula,'1121845230');
 assert.equal((await api.POST(req({token,accion:'firmar',firma,acepta:true,acepta_datos:false}))).status,400);
 r=await api.POST(req({token,accion:'firmar',firma,acepta:true,acepta_datos:true,comercial:true,datos:{nombre:'Otro nombre'}}));d=await r.json();
 assert.equal(r.status,200);assert.equal(state.signed.datos.nombre,'Laura Méndez','profile comes from the ERP, not the browser');
 assert.match(state.signed.hash,/^[0-9a-f]{64}$/);assert(JSON.stringify(state.signed.texto).includes('Ley 1581'));assert.equal(state.updated.estado,'pendiente','after signing the ally waits for approval');assert(state.pdf.path.endsWith('.pdf'));assert.match(state.pie,/Laura Méndez/);assert.equal(JSON.stringify(sent.map(x=>x.adjuntos)),'[1,0]','PDF to the ally, notice to administration');assert.equal(d.codigo.length,12);
 r=await api.POST(req({token,accion:'ver'}));d=await r.json();assert.equal(d.firmado,true);
 // With an uploaded Word agreement, its text (fields filled) is what the ally signs.
 state={ally:{...state.ally,estado:'pendiente_firma',tipos_aliado:{nombre:'Fotógrafos'}},signed:null,config:null,acuerdo:{version:2,secciones:[{titulo:'Partes',parrafos:['Aliado {nombre}, C.C. {cédula}, {tipo}']}]}};
 d=await (await api.POST(req({token,accion:'ver'}))).json();assert.equal(d.acuerdo[0].parrafos[0],'Aliado Laura Méndez, C.C. 1121845230, Fotógrafos');
 r=await api.POST(req({token,accion:'firmar',firma,acepta:true,acepta_datos:true,comercial:true}));assert.equal(r.status,200);assert.equal(state.signed.version,'Word v2');assert(JSON.stringify(state.signed.texto).includes('Ley 1581'));
 console.log('PASS: direct ally signs once (profile from ERP, Ley 1581 authorization, hash) waits for approval with the signed PDF');
})().catch(e=>{console.error(e);process.exitCode=1});
