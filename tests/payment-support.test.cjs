const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {supportType,supportFileError,supportPath,formatBytes}=compile('lib/payment-support.ts');
assert.equal(supportType({name:'IMG_1.HEIC',type:''}),'image/heic');assert.equal(supportType({name:'x.pdf',type:'application/pdf'}),'application/pdf');
assert.equal(supportType({name:'a.exe',type:'application/x-msdownload'}),'');
assert.equal(supportFileError({name:'a.jpg',type:'image/jpeg',size:500}),'');
assert.match(supportFileError({name:'a.jpg',type:'image/jpeg',size:11*1024*1024}),/10 MB/);
assert.match(supportFileError({name:'a.html',type:'text/html',size:5}),/ni un PDF/);
// 1 Nov 02:00 UTC is still 31 Oct in Bogotá
assert.equal(supportPath('sede',{name:'c.jpg',type:'image/jpeg'},new Date('2026-11-01T02:00:00Z'),'id'),'sede/2026/10/id.jpg');
assert.equal(formatBytes(412*1024),'412 KB');
console.log('PASS payment support: file types incl. HEIC, size limit, Bogotá-dated paths');
