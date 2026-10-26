const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const d=compile('lib/direct-allies.ts');
assert.equal(d.onlyDigits('300 123-4567'),'3001234567');
assert.equal(d.ALLY_STATUS.activo.label,'Activo');
assert.equal(d.lineCommission,undefined);
console.log('PASS: direct allies without commissions');
