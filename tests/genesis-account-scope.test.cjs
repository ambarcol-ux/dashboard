const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {canAccessAccountPath,operationsPanels}=compile('lib/role-access.ts');const id='e6507392-c94a-4b9b-85df-b0050b184b09';
assert.equal(operationsPanels.length,6);
for(const path of operationsPanels)assert(canAccessAccountPath(id,path));
for(const path of ['/admin/users','/admin/reports','/admin/config','/admin/metas','/dashboard/horarios','/dashboard/manuales','/perfil','/api/send-welcome','/dashboard/admin/aliados','/admin/inventory/other'])assert(!canAccessAccountPath(id,path),path);
for(const path of ['/contratos/nuevo','/api/dashboard/contracts','/api/contratos/calendario'])assert(canAccessAccountPath(id,path));
assert(canAccessAccountPath('other','/admin/users'));
console.log('PASS: six panels, supporting contract routes, direct-route restrictions and other-account preservation');
