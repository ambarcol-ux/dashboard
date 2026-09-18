const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/initial-deposit.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:m.exports});
const parse=m.exports.initialDepositAmount;
assert.equal(parse(''),0);assert.equal(parse('0'),0);assert.equal(parse('300000'),300000);assert.equal(parse('10.25'),10.25);
for(const v of ['-1','NaN','Infinity','abc','10000000000'])assert.throws(()=>parse(v));
console.log('PASS: initial deposit accepts zero/positive amounts and rejects invalid amounts');
