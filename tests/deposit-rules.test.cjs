const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {suggestedDeposit,contractSuggestedDeposit}=compile('lib/deposit-rules.ts');
assert.equal(suggestedDeposit('Gala',300000),150000);assert.equal(suggestedDeposit('Gala',300001),300000);assert.equal(suggestedDeposit('Gala',900000),300000);
assert.equal(suggestedDeposit('XV Años',1800000),300000);assert.equal(suggestedDeposit('XV Años',1800001),500000);assert.equal(suggestedDeposit('XV Años',3500000),500000);assert.equal(suggestedDeposit('XV Años',3500001),1000000);
assert.equal(suggestedDeposit('Novia',1000000),null);assert.equal(suggestedDeposit('Gala',null),null);assert.equal(suggestedDeposit('Gala',0),null);
assert.equal(contractSuggestedDeposit([{categoria:'Gala',precio:200000},{categoria:'XV Años',precio:2000000}]),500000);
assert.equal(contractSuggestedDeposit([{categoria:'Otro',precio:1}]),null);
console.log('PASS: deposit table by category (Gala / XV) and price');
