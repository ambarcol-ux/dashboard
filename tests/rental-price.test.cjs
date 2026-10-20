const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {rentalPrice,blockContractId}=compile('lib/rental-price.ts');
assert.equal(JSON.stringify(rentalPrice(1200000,900000,true)),JSON.stringify({label:'Precio contrato',value:1200000,text:'$1.200.000'}));
assert.equal(rentalPrice(null,450000,false).text,'$450.000');assert.equal(rentalPrice(null,450000,false).label,'Precio lista');
assert.equal(rentalPrice(null,0,false).text,'Sin precio');assert.equal(rentalPrice(null,null,false).text,'Sin precio');assert.equal(rentalPrice(0,500000,true).text,'Sin precio');
assert.equal(blockContractId('evento-0e83e2d7-533e-4bfb-8799-d32666dae091-2'),'0e83e2d7-533e-4bfb-8799-d32666dae091');assert.equal(blockContractId('x'),null);
console.log('PASS: rental price label/format (contract vs list price, "Sin precio")');
