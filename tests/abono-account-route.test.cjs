const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {canAccessAccountPath,canAccessPath}=compile('lib/role-access.ts');
const route='/dashboard/pago/12345678-1234-1234-1234-123456789012';
for(const id of ['bd8f61a5-8ecf-4b78-9282-5c7812b4f277','e6507392-c94a-4b9b-85df-b0050b184b09','f5e07ef5-2daf-467e-a56a-2caeaf093c4f']) {
 assert(canAccessAccountPath(id,route));assert(canAccessAccountPath(id,route+'/'));
 for(const path of ['/dashboard/pago','/dashboard/pago/admin',route+'/editar','/admin/users','/admin/reports'])assert(!canAccessAccountPath(id,path),path);
}
assert(!canAccessPath('contabilidad',route));
console.log('PASS: scoped advisors can open contract payments; unrelated routes and accounting remain restricted');
