const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const e={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(e,n=>deps[n]||require(n));return e;}
const pages=load('lib/collect-pages.ts'),base=load('lib/load-dashboard-contracts.ts');
const {loadOperationsIndex}=load('lib/load-operations.ts',{'./collect-pages':pages,'./load-dashboard-contracts':base});
const contracts=Array.from({length:1501},(_,i)=>({id:String(i),estado:i%10===0?'mantenimiento':'firmado',sede_id:i%2?'pereira':'barranquilla'}));
const calls=[];
const client={from(table){const q={table,filters:[],select(columns){this.columns=columns;return this;},order(){return this;},eq(k,v){this.filters.push(r=>r[k]===v);return this;},in(k,v){this.filters.push(r=>v.includes(r[k]));return this;},range(a,b){this.a=a;this.b=b;return this;},then(resolve){calls.push({table:this.table,columns:this.columns,a:this.a,b:this.b});const rows=table==='contratos'?contracts:contracts.filter(c=>c.estado==='mantenimiento').map(c=>({id:'m'+c.id,contrato_id:c.id,tipo:'SASTRERÍA',completado:false,estado:'en proceso'}));return Promise.resolve({data:rows.filter(r=>this.filters.every(f=>f(r))).slice(this.a,this.b+1),error:null}).then(resolve);}};return q;}};
(async()=>{
 const all=await loadOperationsIndex(client);assert.equal(all.length,1501);assert.equal(new Set(all.map(c=>c.id)).size,1501);assert.equal(all[1500].mantenimientos.length,1);
 assert.ok(calls.every(c=>c.b-c.a===499));assert.ok(calls.every(c=>!c.columns.includes('*')&&!c.columns.includes('firma_base64')&&!c.columns.includes('fotos')));
 assert.ok(!calls.some(c=>c.table==='vestidos'||c.table==='arreglos'||c.table==='entregas_bitacora'));
 const scoped=await loadOperationsIndex(client,'pereira');assert.equal(scoped.length,750);assert.ok(scoped.every(c=>c.sede_id==='pereira'));
 const broken={from(){const q={select(){return q},order(){return q},range(){return Promise.resolve({data:null,error:new Error('timeout')})}};return q}};
 await assert.rejects(()=>loadOperationsIndex(broken),/timeout/);
 console.log('PASS: 1501 contracts without truncation; branch isolation; no signatures/photos/details in calendar load; failed reads reject.');
})().catch(e=>{console.error(e);process.exitCode=1});
