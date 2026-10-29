const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {canEditSavedRecords}=compile('lib/saved-record-editing.ts');
const perm=['registros.editar_guardados'];
assert(canEditSavedRecords({rol:'asesora',activo:true},perm));
assert(!canEditSavedRecords({rol:'asesora',activo:false},perm));
assert(!canEditSavedRecords({rol:'asesora'},[]));
assert(!canEditSavedRecords({rol:'asesora',app_metadata:{rol:'admin'}}));
assert(canEditSavedRecords({rol:'admin'}));assert(canEditSavedRecords({rol:'asesora',rol_id:'admin'}));
console.log('PASS: saved-record editing by role permission, inactive denial and administrator');
