const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const e={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(e,n=>deps[n]||require(n));return e;}
const deposits=load('lib/deposits.ts');const {closingAmounts}=load('lib/finalize-deposit.ts',{'./deposits':deposits});
assert.deepEqual(closingAmounts(500000,'300000','Daño en vestido'),{discount:300000,refund:200000});
assert.deepEqual(closingAmounts(500000,'0',''),{discount:0,refund:500000});
assert.deepEqual(closingAmounts(500000,'500000','Daño total'),{discount:500000,refund:0});
assert.deepEqual(closingAmounts(0,'0',''),{discount:0,refund:0});
for(const raw of ['-1','500001','NaN','Infinity','0.001',''])assert.throws(()=>closingAmounts(500000,raw,'Daño'));
assert.throws(()=>closingAmounts(500000,'300000',' '),/motivo/);
assert.deepEqual(closingAmounts(1.01,'0.30','Daño'),{discount:.3,refund:.71});
console.log('PASS: 500k-300k=200k, zero/full deduction, cents, invalid values and mandatory reason');
