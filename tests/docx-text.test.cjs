const assert=require('node:assert/strict'),compile=require('./compile.cjs'),fs=require('node:fs'),zlib=require('node:zlib');
const d=compile('lib/docx-text.ts');
// Minimal .docx: one deflated word/document.xml entry.
const xml=Buffer.from('<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Partes</w:t></w:r></w:p><w:p><w:r><w:t>Entre AMBAR y {nom</w:t></w:r><w:r><w:t xml:space="preserve">bre}, C.C. {cédula} &amp; tipo {tipo}</w:t></w:r></w:p><w:p><w:r><w:t>CLÁUSULA PRIMERA</w:t></w:r></w:p><w:p><w:r><w:t>Firmado el {fecha}.</w:t></w:r></w:p></w:body></w:document>');
const name=Buffer.from('word/document.xml'),data=zlib.deflateRawSync(xml);
const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(data.length,18);local.writeUInt16LE(name.length,26);
const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(8,10);central.writeUInt32LE(data.length,20);central.writeUInt16LE(name.length,28);central.writeUInt32LE(0,42);
const cdStart=30+name.length+data.length,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,10);end.writeUInt32LE(46+name.length,12);end.writeUInt32LE(cdStart,16);
const zip=Buffer.concat([local,name,data,central,name,end]);
const s=d.docxSections(d.zipEntry(zip,'word/document.xml'));
assert.equal(JSON.stringify(s.map(x=>x.titulo)),JSON.stringify(['Partes','CLÁUSULA PRIMERA']));
const f=d.fillAgreement(s,{nombre:'Ana',cedula:'123',tipo:'Fotógrafos',fecha:'1 de noviembre de 2026'});
assert.equal(f[0].parrafos[0],'Entre AMBAR y Ana, C.C. 123 & tipo Fotógrafos');
assert.equal(f[1].parrafos[0],'Firmado el 1 de noviembre de 2026.');
assert.throws(()=>d.zipEntry(Buffer.from('hola'),'word/document.xml'),/Word/);
console.log('PASS: agreement Word parsing and fields');
