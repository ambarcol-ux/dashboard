const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),crypto=require('node:crypto');
const cache={};let client;
function load(file){if(cache[file])return cache[file];const mod={exports:{}};cache[file]=mod.exports;
new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(mod.exports,name=>{
 if(name==='next/server')return {NextResponse:{json:(body,options={})=>({body,status:options.status||200,headers:options.headers})}};
 if(name==='@supabase/supabase-js')return {createClient:()=>client};
 if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
 if(name.startsWith('./'))return load(require('node:path').join(require('node:path').dirname(file),name)+'.ts');
 return require(name);
});return mod.exports;}
const {rows,sedes,base,now,digest}=JSON.parse(fs.readFileSync('tests/fixtures/dashboard-filters.json','utf8'));
const {filterDashboardContracts,summarizeDashboard}=load('lib/dashboard-summary.ts');
const outputs=[];
for(const filtroSede of ['Todas','barranquilla','pereira','unassigned'])for(const activeTabLogistica of ['por_entregar','en_evento','lavanderia','historial','anulados'])for(const filtroHito of ['Todos','Cita de Medidas','Prueba Final','Fecha de Entrega/Envío','Sesión Pre-XV'])for(const filtroRango of ['Cualquier Fecha','Hoy','Esta Semana','Este Mes','Personalizado'])for(const filtroAlerta of ['ninguna','entregas_omitidas','borradores_sin_firmar'])for(const filtroTipoEvento of ['Todos','PREXV']){
 outputs.push(filterDashboardContracts(rows,sedes,{...base,filtroSede,activeTabLogistica,filtroHito,filtroRango,filtroAlerta,filtroTipoEvento},now).map(r=>r.id));
}
// Golden digest obtained from the previous production filter predicates, in America/Bogota.
assert.equal(crypto.createHash('sha256').update(JSON.stringify(outputs)).digest('hex'),digest);
assert.equal(filterDashboardContracts(rows,sedes,{...base,searchTerm:'global',filtroSede:'pereira'},now).length,rows.length);
const sample=summarizeDashboard(rows,sedes,base,now);
assert.equal(sample.summary.total,sample.filtered.length);
assert.equal(sample.summary.totalPendiente,sample.filtered.reduce((n,c)=>n+Number(c.saldo)+Number(c.total_multas),0));
assert.equal(summarizeDashboard(rows,sedes,{...base,filtroSede:'pereira'},now).summary.tabCounts.en_evento,0);
const contracts=Array.from({length:625},(_,i)=>({id:'c'+i,numero_contrato:'CON-'+i,estado:'confirmado',sede_id:i<75?'barranquilla':'bogota',saldo:100,total_multas:5,created_at:'2026-09-15T15:00:00Z'}));
const calls=[];let fail=false;
client={from(table){let data={contratos:contracts,entregas_bitacora:[],sedes:sedes.map(s=>({...s,activo:true})),arreglos:[],contrato_items_vestidos:[],vestidos:[]}[table];let columns;
 return{select(c){columns=c;return this},order(){return this},eq(k,v){data=data.filter(r=>r[k]===v);return this},in(k,ids){data=data.filter(r=>ids.includes(r[k]));return this},or(){return this},ilike(){return this},async range(a,b){calls.push({table,columns,length:data.slice(a,b+1).length});return{data:fail?null:data.slice(a,b+1),error:fail?Error('offline'):null}}};}};
const {GET}=load('app/api/dashboard/contracts/route.ts');
const profile={id:'user',nombre:'Test',email:'test@example.invalid',rol:'admin',sede_id:null,activo:true};
function req(params={},p=profile){return {nextUrl:new URL('https://erp.invalid/api/dashboard/contracts?'+new URLSearchParams({...base,...params})),headers:new Headers(p?{'x-ambar-verified-deposit-profile':encodeURIComponent(JSON.stringify(p))}:{}),cookies:{get:()=>({value:'test-token'})},signal:new AbortController().signal};}
(async()=>{
 assert.equal((await GET(req({},null))).status,401);
 assert.equal((await GET(req({},{...profile,activo:false}))).status,401);
 assert.equal((await GET(req({},{...profile,rol:'contabilidad'}))).status,403);
 const first=await GET(req({filtroSede:'barranquilla'}));
 assert.equal(first.status,200);assert.equal(first.body.contracts.length,30);assert.equal(first.body.summary.total,75);assert.equal(first.body.summary.totalPendiente,7875);assert.equal(first.body.summary.monthCount,75);
 assert.equal(first.headers['Cache-Control'],'private, no-store');
 assert.ok(calls.some(c=>c.table==='contratos'&&c.length===500));
 assert.ok(calls.filter(c=>c.table==='contratos'&&c.columns.includes('cliente_nombre')).every(c=>c.length<=30));
 assert.ok(calls.filter(c=>c.table==='contratos').every(c=>!c.columns.includes('firma_base64')));
 const second=await GET(req({filtroSede:'barranquilla',page:2}));assert.equal(second.body.contracts.length,30);assert.ok(!second.body.contracts.some(c=>first.body.contracts.some(x=>x.id===c.id)));assert.equal(second.body.summary.total,75);
 const last=await GET(req({filtroSede:'barranquilla',page:999}));assert.equal(last.body.page,3);assert.equal(last.body.contracts.length,15);
 const empty=await GET(req({filtroSede:'pereira',page:2}));assert.equal(empty.body.page,1);assert.equal(empty.body.contracts.length,0);assert.equal(empty.body.summary.total,0);
 const scoped=await GET(req({filtroSede:'bogota'},{...profile,rol:'asesora',sede_id:'barranquilla'}));assert.equal(scoped.body.summary.total,0);
 const allScoped=await GET(req({},{...profile,rol:'asesora',sede_id:'barranquilla'}));assert.equal(allScoped.body.summary.total,75);assert.ok(allScoped.body.contracts.every(c=>c.sede_id==='barranquilla'));
 fail=true;const oldError=console.error;console.error=()=>{};assert.equal((await GET(req())).status,503);console.error=oldError;
 console.log('PASS: 3000 legacy filter cases, full totals, 625-row summary pagination, 30-row details, independent pages, empty Pereira, site scope, access denial, no-cache, failures');
})().catch(e=>{console.error(e);process.exitCode=1});
