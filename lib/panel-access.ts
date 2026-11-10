
export type PanelOverride='permitido'|'bloqueado';
export type PanelOverrides=Record<string,PanelOverride>;
type Profile={id?:unknown;rol?:unknown;rol_id?:unknown;email?:unknown;estado_ficha?:unknown}|null|undefined;
const norm=(v:unknown)=>String(v??'').trim().toLowerCase();
/** Suppliers only use their portal (they have no ERP role). */
export const isSupplierProfile=(profile:Profile)=>norm(profile?.rol)==='proveedor';
/** The single role (rol_id) decides; the legacy text role is only a fallback while a profile has no rol_id. */
export const roleOf=(profile:Profile)=>norm(profile?.rol_id)||norm(profile?.rol);
export const isAdminProfile=(profile:Profile)=>roleOf(profile)==='admin';
export const isAccountingProfile=(profile:Profile)=>roleOf(profile)==='contabilidad';
export type Panel={id:string;label:string;href:string;block:string;
 /** Paths (prefixes) that belong to the panel; the longest match wins. */
 paths:string[];
 /** Shown by default to advisors (and other non-admin staff accounts). */
 staff?:boolean;
 /** Can be granted to non-admin users: the data behind it is not reserved to administrators. */
 grantable:boolean};

/** Every panel of the ERP menu. Order = menu order. */
export const PANELS:Panel[]=[
 {id:'dashboard',label:'Dashboard',href:'/dashboard',block:'OPERACIONES',paths:['/dashboard','/dashboard/pago','/contratos'],staff:true,grantable:true},
 {id:'calendario',label:'Calendario contratos',href:'/dashboard/calendario',block:'OPERACIONES',paths:['/dashboard/calendario'],staff:true,grantable:true},
 {id:'primeras-citas',label:'Primeras visitas',href:'/dashboard/primeras-citas',block:'OPERACIONES',paths:['/dashboard/primeras-citas','/dashboard/calendario/analisis'],staff:true,grantable:true},
 {id:'disponibilidad',label:'Agenda de vestidos',href:'/disponibilidad',block:'OPERACIONES',paths:['/disponibilidad'],staff:true,grantable:true},
 {id:'pedidos_estrene',label:'Pedidos estrene',href:'/dashboard/pedidos-estrene',block:'OPERACIONES',paths:['/dashboard/pedidos-estrene'],staff:true,grantable:true},
 {id:'retablos',label:'Retablos',href:'/dashboard/retablos',block:'OPERACIONES',paths:['/dashboard/retablos'],staff:true,grantable:true},
 {id:'depositos',label:'Depósitos y devoluciones',href:'/dashboard/devoluciones-depositos',block:'OPERACIONES',paths:['/dashboard/devoluciones-depositos'],staff:true,grantable:true},
 {id:'traslados',label:'Traslados',href:'/dashboard/traslados',block:'OPERACIONES',paths:['/dashboard/traslados'],staff:true,grantable:true},
 {id:'inventory',label:'Gestión de inventario',href:'/admin/inventory',block:'OPERACIONES',paths:['/admin/inventory'],grantable:true},
 {id:'reports',label:'Reportes y estadísticas',href:'/admin/reports',block:'OPERACIONES',paths:['/admin/reports'],grantable:true},
 {id:'cobros',label:'Cuentas por cobrar',href:'/dashboard/cuentas-por-cobrar',block:'FINANZAS',paths:['/dashboard/cuentas-por-cobrar'],staff:true,grantable:true},
 {id:'caja',label:'Cierres de caja',href:'/dashboard/caja',block:'FINANZAS',paths:['/dashboard/caja'],staff:true,grantable:true},
 {id:'proveedores-catalogo',label:'Catálogo de proveedores',href:'/dashboard/proveedores/catalogo',block:'PROVEEDORES',paths:['/dashboard/proveedores/catalogo'],staff:true,grantable:true},
 {id:'proveedores',label:'Gestión de proveedores',href:'/dashboard/proveedores',block:'PROVEEDORES',paths:['/dashboard/proveedores'],grantable:false},
 {id:'proveedores-pagos',label:'Pagos a proveedores',href:'/dashboard/proveedores/pagos',block:'PROVEEDORES',paths:['/dashboard/proveedores/pagos'],grantable:false},
 {id:'metas',label:'Metas y ventas',href:'/admin/metas',block:'VENTAS & CRM',paths:['/admin/metas'],staff:true,grantable:true},
 {id:'catalogo',label:'Catálogo de vestidos',href:'/dashboard/catalogo',block:'VENTAS & CRM',paths:['/dashboard/catalogo'],staff:true,grantable:true},
 {id:'whatsapp',label:'WhatsApp 304',href:'/dashboard/whatsapp',block:'VENTAS & CRM',paths:['/dashboard/whatsapp'],staff:true,grantable:true},
 {id:'correo',label:'Correo (promociones)',href:'/dashboard/correo',block:'VENTAS & CRM',paths:['/dashboard/correo'],staff:true,grantable:true},
 {id:'aliados_directos',label:'Aliados directos',href:'/dashboard/aliados-directos',block:'RED DE ALIADOS',paths:['/dashboard/aliados-directos'],staff:true,grantable:true},
 {id:'aliados_admin',label:'Gestión de aliados',href:'/dashboard/admin/aliados',block:'RED DE ALIADOS',paths:['/dashboard/admin/aliados'],grantable:true},
 {id:'users',label:'Gestión de equipo',href:'/admin/users',block:'ADMINISTRACIÓN',paths:['/admin/users'],grantable:false},
 {id:'horarios',label:'Control de asistencia',href:'/dashboard/horarios',block:'ADMINISTRACIÓN',paths:['/dashboard/horarios'],grantable:true},
 {id:'config',label:'Configuración base',href:'/admin/config',block:'ADMINISTRACIÓN',paths:['/admin/config'],grantable:false},
 {id:'clausulas',label:'Cláusulas del contrato',href:'/dashboard/admin/contratos',block:'ADMINISTRACIÓN',paths:['/dashboard/admin/contratos'],grantable:false},
 {id:'siigo',label:'Facturación por sede',href:'/admin/config/siigo',block:'ADMINISTRACIÓN',paths:['/admin/config/siigo'],grantable:false},
 {id:'integraciones',label:'Integraciones',href:'/admin/config/integraciones',block:'ADMINISTRACIÓN',paths:['/admin/config/integraciones'],grantable:false},
 {id:'accesos',label:'Accesos por perfil',href:'/admin/accesos',block:'ADMINISTRACIÓN',paths:['/admin/accesos'],grantable:false},
 {id:'documentos',label:'Documentos de la marca',href:'/dashboard/documentos',block:'ADMINISTRACIÓN',paths:['/dashboard/documentos'],staff:true,grantable:true},
 {id:'manual',label:'Manual de usuario',href:'/dashboard/manuales',block:'SOPORTE Y AYUDA',paths:['/dashboard/manuales'],staff:true,grantable:true},
];
export const panelById=(id:string)=>PANELS.find(p=>p.id===id);

/** Panel a page path belongs to (longest prefix), or null for paths outside the menu (login, APIs, public pages). */
export function panelForPath(path:string){
 const clean=path.replace(/(.)\/$/,'$1');
 let best:Panel|null=null,len=-1;
 for(const p of PANELS)for(const prefix of p.paths){
  if((clean===prefix||clean.startsWith(prefix+'/'))&&prefix.length>len){best=p;len=prefix.length;}
 }
 return best;
}

/** Can this user receive panels? Suppliers only use their portal. */
export const canReceiveGrants=(profile:Profile)=>!!profile&&!isSupplierProfile(profile);

/** Role access: the "panel.<id>" permission of the person's single role decides; the Administrator sees everything. */
export function rolePanelAccess(panelId:string,profile:Profile,permissions?:string[]|null){
 const panel=panelById(panelId);
 if(!panel||!profile||isSupplierProfile(profile))return false;
 if(isAdminProfile(profile))return true;
 if(panelId==='accesos')return false;
 return !!permissions?.includes(`panel.${panelId}`);
}
/** Kept for callers: without individual changes the default is the role access. */
export const defaultPanelAccess=(panelId:string,profile:Profile)=>rolePanelAccess(panelId,profile,null);

/** Final access: only the role (rol_id + roles_permisos). Individual panel changes are no longer used. */
export function panelAccess(panelId:string,profile:Profile,_overrides:PanelOverrides|null|undefined,permissions?:string[]|null){
 return rolePanelAccess(panelId,profile,permissions);
}

/** First panel the user can open, used as landing page when the usual one was removed. */
export function firstAllowedPanel(profile:Profile,overrides:PanelOverrides|null|undefined,permissions?:string[]|null){
 return PANELS.find(p=>panelAccess(p.id,profile,overrides,permissions))?.href||null;
}

export function overridesFromRows(rows:{panel:string;estado:string}[]|null|undefined):PanelOverrides{
 const out:PanelOverrides={};
 for(const r of rows||[])if(r.estado==='permitido'||r.estado==='bloqueado')out[r.panel]=r.estado;
 return out;
}
