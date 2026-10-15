const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {canAccessPath,homeForRole,isSupplier,isAdminProfile}=compile('lib/role-access.ts');
for(const p of ['/proveedor','/proveedor/','/login'])assert.equal(canAccessPath('proveedor',p),true,p);
for(const p of ['/dashboard','/proveedores','/dashboard/proveedores','/proveedor/otro','/api/dashboard/contracts','/admin/users'])assert.equal(canAccessPath('Proveedor',p),false,p);
assert.equal(homeForRole('proveedor'),'/proveedor');assert(isSupplier(' PROVEEDOR '));
assert.equal(isAdminProfile({id:'x',rol:'proveedor',email:'a@b.co'}),false);
assert.equal(canAccessPath('asesora','/dashboard/proveedores/catalogo'),true);
console.log('PASS supplier access: suppliers are confined to their portal and never count as admin');
