const assert=require('node:assert/strict'),compile=require('./compile.cjs');
process.env.SUPABASE_SERVICE_ROLE_KEY='service-key-test';process.env.NEXT_PUBLIC_SUPABASE_URL='https://db.test';delete process.env.FIRST_VISIT_LINK_SECRET;
const lib=compile('lib/ally-contract.ts');
const id='11111111-1111-1111-1111-111111111111';
const config={id:1,representante:'Lina Polo',representante_cedula:'123',representante_ciudad_cedula:'Bogotá',nit:'900',direccion:'Cra 15',ciudad:'Bogotá',correo:'a@b.co',telefono:'300',deposito_por_vestido:300000,mora_por_dia:50000,clausula_penal:1000000,cuenta_redes:'ambar'};
let state;
const table=name=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:name==='referidores'?state.ally:name==='aliados_contratos_firmados'?state.signed:state.config,error:null})})}),
 insert:async row=>{if(state.signed)return {error:{code:'23505'}};state.signed={...row,datos_aliado:row.datos_aliado};state.inserted=row;return {error:null};},
 update:v=>({eq:async()=>{state.updated=v;return {error:null};}})});
const api=compile('app/api/aliados/contrato/route.ts',{'@/lib/public-db':{...compile('lib/public-db.ts'),publicServerClient:()=>({from:table})},'@/lib/ally-contract':lib});
const req=body=>new Request('https://erp.test/api/aliados/contrato',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const token=lib.allyContractToken(id,Date.now()+60000,'service-key-test');
const datos={nombre:'Christian Aldana',cedula:'1020304',celular:'3208649001',correo:'c@x.co',direccion:'Calle 1 # 2-3',ciudad:'Bogotá',banco:'Nequi',tipo_cuenta:'Ahorros',numero_cuenta:'3208649001'};
const firma='data:image/png;base64,AAAA';
(async()=>{
 state={ally:{id,nombre_aliado:'Christian'},signed:null,config};
 assert.equal((await api.POST(req({token:'x.1.y'}))).status,404);
 let r=await api.POST(req({token,accion:'ver'}));let d=await r.json();assert.equal(d.firmado,false);assert.equal(d.config.nit,'900');assert.equal(d.aliado.nombre,'Christian');
 state.config={...config,nit:null};assert.equal((await api.POST(req({token,accion:'ver'}))).status,409);state.config=config;
 assert.equal((await api.POST(req({token,accion:'firmar',datos,firma,acepta:false}))).status,400);
 assert.equal((await api.POST(req({token,accion:'firmar',datos,firma:'nope',acepta:true}))).status,400);
 r=await api.POST(req({token,accion:'firmar',datos,firma,acepta:true}));d=await r.json();
 assert.equal(r.status,200);assert.equal(d.firmado,true);assert.equal(state.inserted.referidor_id,id);assert.equal(state.updated.cedula,'1020304');assert.equal(state.updated.tipo_cuenta,'Ahorros');
 r=await api.POST(req({token,accion:'ver'}));d=await r.json();assert.equal(d.firmado,true);assert.equal(d.firma,firma);
 console.log('PASS: ally signs once through the private link; profile saved; signed copy returned afterwards');
})().catch(e=>{console.error(e);process.exitCode=1});
