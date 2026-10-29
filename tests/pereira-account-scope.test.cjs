const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {canEditSavedRecords}=compile('lib/saved-record-editing.ts');
// Editing saved records comes from the role permission, not from fixed accounts.
for(const id of ['6fa678ad-dbe1-486a-a3e8-5f818fb06f34','be72d188-db7a-4719-bfdf-230010501cb8','2af2dd92-f559-4858-ac5a-5354e6f93b5e']){
 assert(canEditSavedRecords({id,rol:'asesora',rol_id:'asesora_lider',activo:true},['registros.editar_guardados']));
 assert(!canEditSavedRecords({id,rol:'asesora',rol_id:'asesora_lider',activo:true},[]));
}
console.log('PASS: Pereira advisors edit saved records through their role permission');
