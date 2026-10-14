const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {canAccessAccountPath,operationsPanels}=compile('lib/role-access.ts');const id='bd8f61a5-8ecf-4b78-9282-5c7812b4f277';
assert.equal(operationsPanels.length,8);
for(const path of operationsPanels)assert(canAccessAccountPath(id,path));
for(const path of ['/admin/users','/admin/reports','/admin/config','/admin/metas','/dashboard/horarios','/dashboard/manuales','/perfil','/api/send-welcome','/dashboard/admin/aliados','/admin/inventory/other'])assert(!canAccessAccountPath(id,path),path);
for(const path of ['/contratos/nuevo','/api/dashboard/contracts','/api/contratos/calendario'])assert(canAccessAccountPath(id,path));
assert(canAccessAccountPath('other','/admin/users'));
console.log('PASS: seven panels, supporting contract routes, direct-route restrictions and other-account preservation');
