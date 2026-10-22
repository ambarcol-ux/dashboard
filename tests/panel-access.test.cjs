const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {panelForPath,defaultPanelAccess,panelAccess,firstAllowedPanel,overridesFromRows,PANELS}=compile('lib/panel-access.ts');
const {operationsPanels}=compile('lib/role-access.ts');
const admin={id:'a',rol:'admin'},asesora={id:'b',rol:'asesora'},conta={id:'c',rol:'contabilidad'},prov={id:'d',rol:'proveedor'},scoped={id:'bd8f61a5-8ecf-4b78-9282-5c7812b4f277',rol:'asesora'};
// Paths map to the most specific panel
assert.equal(panelForPath('/dashboard').id,'dashboard');assert.equal(panelForPath('/dashboard/pago/123').id,'dashboard');assert.equal(panelForPath('/contratos/nuevo').id,'dashboard');
assert.equal(panelForPath('/dashboard/calendario').id,'calendario');assert.equal(panelForPath('/dashboard/calendario/analisis').id,'primeras-citas');
assert.equal(panelForPath('/dashboard/proveedores/pagos').id,'proveedores-pagos');assert.equal(panelForPath('/dashboard/proveedores/abc').id,'proveedores');
assert.equal(panelForPath('/admin/config/siigo').id,'siigo');assert.equal(panelForPath('/admin/config').id,'config');
assert.equal(panelForPath('/login'),null);assert.equal(panelForPath('/api/dashboard/contracts'),null);assert.equal(panelForPath('/dashboardx'),null);
// Defaults reproduce the old menu rules
assert(PANELS.every(p=>defaultPanelAccess(p.id,admin)));
assert.equal(JSON.stringify(PANELS.filter(p=>defaultPanelAccess(p.id,asesora)).map(p=>p.id)),JSON.stringify(['dashboard','calendario','primeras-citas','disponibilidad','pedidos_estrene','retablos','depositos','caja','proveedores-catalogo','metas','aliados_directos','manual']));
assert.equal(JSON.stringify(PANELS.filter(p=>defaultPanelAccess(p.id,conta)).map(p=>p.id)),JSON.stringify(['depositos','caja','aliados_directos']));
assert.equal(JSON.stringify(PANELS.filter(p=>defaultPanelAccess(p.id,scoped)).map(p=>p.href)),JSON.stringify(operationsPanels));
assert(!PANELS.some(p=>defaultPanelAccess(p.id,prov)));
// Manual changes
assert(panelAccess('metas',asesora,{metas:'permitido'}));assert(!panelAccess('calendario',asesora,{calendario:'bloqueado'}));
assert(!panelAccess('users',asesora,{users:'permitido'}),'admin-only panels cannot be granted');
assert(panelAccess('calendario',conta,{calendario:'permitido'}),'accounting receives the panels the admin allows');assert(!panelAccess('calendario',conta,{}),'accounting keeps only deposits and cash by default');assert(!panelAccess('users',conta,{users:'permitido'}),'admin-only panels are never granted');
assert(!panelAccess('caja',conta,{caja:'bloqueado'}));
assert(panelAccess('accesos',admin,{accesos:'bloqueado'}),'admins never lose the access panel');assert(!panelAccess('accesos',asesora,{}));
assert.equal(firstAllowedPanel(asesora,{dashboard:'bloqueado'}),'/dashboard/calendario');
assert.equal(JSON.stringify(overridesFromRows([{panel:'a',estado:'permitido'},{panel:'b',estado:'defecto'},{panel:'c',estado:'bloqueado'}])),JSON.stringify({a:'permitido',c:'bloqueado'}));
// Roles: the user's permissions (sum of roles) decide; manual "Quitar" still wins; admin-only panels are never granted by a role
assert(panelAccess('dashboard',asesora,{},['panel.dashboard']));assert(!panelAccess('calendario',asesora,{},['panel.dashboard']),'role without the permission loses the panel');
assert(panelAccess('metas',conta,{},['panel.depositos','panel.metas']));assert(!panelAccess('metas',conta,{metas:'bloqueado'},['panel.metas']));
assert(!panelAccess('users',asesora,{},['panel.users']));assert(panelAccess('users',admin,{},[]));
assert(!panelAccess('metas',scoped,{},['panel.metas']),'scoped operations accounts keep their fixed panels');
console.log('PASS panel access: path mapping, role defaults equal the old menu, grants/removals and safety rules');
