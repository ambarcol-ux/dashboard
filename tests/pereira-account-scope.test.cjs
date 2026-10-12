const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {canAccessAccountPath,isScopedOperationsAccount}=compile('lib/role-access.ts');
const {canEditSavedRecords}=compile('lib/saved-record-editing.ts');
// liderpereira, asesorapereira, ambarcouturepereira
for(const id of ['6fa678ad-dbe1-486a-a3e8-5f818fb06f34','be72d188-db7a-4719-bfdf-230010501cb8','2af2dd92-f559-4858-ac5a-5354e6f93b5e']){
 assert(isScopedOperationsAccount(id));
 for(const path of ['/dashboard','/dashboard/calendario','/dashboard/primeras-citas','/contratos/nuevo','/api/dashboard/contracts'])assert(canAccessAccountPath(id,path));
 assert(!canAccessAccountPath(id,'/admin/users'));
 assert(canEditSavedRecords({id,rol:'asesora',activo:true}));
}
console.log('PASS: three Pereira advisors get the same scoped operations access as the other sites');
