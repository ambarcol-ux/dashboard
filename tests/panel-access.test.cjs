const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {panelForPath,panelAccess,firstAllowedPanel,PANELS,isAdminProfile}=compile('lib/panel-access.ts');
const admin={id:'a',rol:'asesora',rol_id:'admin'},asesora={id:'b',rol:'asesora',rol_id:'asesora'},conta={id:'c',rol:'contabilidad',rol_id:'contabilidad'},prov={id:'d',rol:'proveedor'};
// Paths map to the most specific panel
assert.equal(panelForPath('/dashboard').id,'dashboard');assert.equal(panelForPath('/dashboard/pago/123').id,'dashboard');assert.equal(panelForPath('/contratos/nuevo').id,'dashboard');
assert.equal(panelForPath('/dashboard/calendario').id,'calendario');assert.equal(panelForPath('/dashboard/calendario/analisis').id,'primeras-citas');
assert.equal(panelForPath('/dashboard/proveedores/pagos').id,'proveedores-pagos');assert.equal(panelForPath('/dashboard/proveedores/abc').id,'proveedores');
assert.equal(panelForPath('/admin/config/siigo').id,'siigo');assert.equal(panelForPath('/admin/config').id,'config');
assert.equal(panelForPath('/login'),null);assert.equal(panelForPath('/api/dashboard/contracts'),null);assert.equal(panelForPath('/dashboardx'),null);
assert.equal(panelForPath('/dashboard/admin/escalas').id,'dashboard','retired commission screens are no longer panels');
// Only the single role decides: rol_id wins over the legacy text role
assert(isAdminProfile(admin));assert(!isAdminProfile({rol:'admin',rol_id:'asesora'}));
assert(PANELS.every(p=>panelAccess(p.id,admin,null,[])));
assert(panelAccess('dashboard',asesora,null,['panel.dashboard']));assert(!panelAccess('calendario',asesora,null,['panel.dashboard']));
assert(!panelAccess('calendario',asesora,{calendario:'permitido'},[]),'individual changes are no longer used');
assert(panelAccess('caja',conta,null,['panel.caja']));assert(!panelAccess('calendario',conta,null,['panel.caja']));
assert(!panelAccess('accesos',asesora,null,['panel.accesos']),'only the Administrator manages access');
assert(!PANELS.some(p=>panelAccess(p.id,prov,null,['panel.dashboard'])),'suppliers only use their portal');
assert.equal(firstAllowedPanel(asesora,null,['panel.calendario']),'/dashboard/calendario');
console.log('PASS panel access: path mapping and role-only access');
