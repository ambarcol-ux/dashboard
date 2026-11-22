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
 // Red VIP / referral program retired: its signing links no longer open or sign anything.
 for(const body of [{token,accion:'ver'},{token,accion:'firmar',datos,firma,acepta:true,acepta_datos:true,comercial:false}])assert.equal((await api.POST(req(body))).status,404);
 assert.equal(state.inserted,undefined);assert.equal(state.updated,undefined);
 console.log('PASS: retired referral (VIP) signing links are rejected and nothing is saved');
})().catch(e=>{console.error(e);process.exitCode=1});
