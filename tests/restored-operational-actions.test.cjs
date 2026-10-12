const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {canEditSavedRecords}=compile('lib/saved-record-editing.ts');
const {canAccessAccountPath,operationsPanels}=compile('lib/role-access.ts');
for(const id of ['bd8f61a5-8ecf-4b78-9282-5c7812b4f277','e6507392-c94a-4b9b-85df-b0050b184b09','f5e07ef5-2daf-467e-a56a-2caeaf093c4f']) {
 assert(canEditSavedRecords({id,rol:'asesora',activo:true}));
 assert(!canEditSavedRecords({id,rol:'asesora',activo:false}));
 assert(canAccessAccountPath(id,'/dashboard/calendario/analisis'));
 assert(!canAccessAccountPath(id,'/admin/users'));
 assert(!canAccessAccountPath(id,'/admin/reports'));
}
assert.equal(operationsPanels.length,7);
assert(operationsPanels.includes('/dashboard/primeras-citas'));
assert(!canEditSavedRecords({id:'other',rol:'asesora'}));
assert(!canEditSavedRecords({rol:'asesora',app_metadata:{rol:'admin'}}));
assert(canEditSavedRecords({rol:'admin'}));
console.log('PASS: scoped operational permissions, inactive denial, seven modules and unchanged other advisors');
