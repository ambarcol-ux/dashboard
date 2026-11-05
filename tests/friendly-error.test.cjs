// Technical database errors become clear Spanish notices (lib/friendly-error.ts).
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const mod={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync('lib/friendly-error.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(mod.exports);
const {mensajeAmigable:f}=mod.exports;
assert.equal(f('null value in column "cliente_email" of relation "contratos" violates not-null constraint'),'Falta el correo de la clienta. Llénalo en el formulario y vuelve a guardar.');
assert.equal(f('Error al procesar solicitud: null value in column "fecha_evento" of relation "contratos" violates not-null constraint'),'Error al procesar solicitud: Falta la fecha del evento. Llénalo en el formulario y vuelve a guardar.');
assert.match(f('duplicate key value violates unique constraint "vestidos_codigo_key"'),/Ya existe un registro con el código/);
assert.match(f('new row for relation "contratos" violates check constraint "contratos_cliente_email_check"'),/Revisa el correo de la clienta/);
assert.match(f('insert or update on table "contratos" violates foreign key constraint "contratos_sede_id_fkey"'),/La sede que elegiste ya no existe/);
assert.match(f('new row violates row-level security policy for table "pagos"'),/No tienes permiso/);
assert.equal(f('El vestido 1390 no tiene precio de venta.'),'El vestido 1390 no tiene precio de venta.');
console.log('PASS: friendly errors');
