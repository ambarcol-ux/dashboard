import {isAccounting,isAdminProfile,isScopedOperationsAccount,isSupplier,operationsPanels} from './role-access';

export type PanelOverride='permitido'|'bloqueado';
export type PanelOverrides=Record<string,PanelOverride>;
type Profile={id?:unknown;rol?:unknown;email?:unknown}|null|undefined;
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
 {id:'depositos',label:'Depósitos y devoluciones',href:'/dashboard/devoluciones-depositos',block:'OPERACIONES',paths:['/dashboard/devoluciones-depositos'],staff:true,grantable:true},
 {id:'inventory',label:'Gestión de inventario',href:'/admin/inventory',block:'OPERACIONES',paths:['/admin/inventory'],grantable:true},
 {id:'reports',label:'Reportes y estadísticas',href:'/admin/reports',block:'OPERACIONES',paths:['/admin/reports'],grantable:true},
 {id:'caja',label:'Cierres de caja',href:'/dashboard/caja',block:'FINANZAS',paths:['/dashboard/caja'],staff:true,grantable:true},
 {id:'proveedores-catalogo',label:'Catálogo de proveedores',href:'/dashboard/proveedores/catalogo',block:'PROVEEDORES',paths:['/dashboard/proveedores/catalogo'],staff:true,grantable:true},
 {id:'proveedores',label:'Gestión de proveedores',href:'/dashboard/proveedores',block:'PROVEEDORES',paths:['/dashboard/proveedores'],grantable:false},
 {id:'proveedores-pagos',label:'Pagos a proveedores',href:'/dashboard/proveedores/pagos',block:'PROVEEDORES',paths:['/dashboard/proveedores/pagos'],grantable:false},
 {id:'metas',label:'Metas y ventas',href:'/admin/metas',block:'VENTAS & CRM',paths:['/admin/metas'],grantable:true},
 {id:'aliados_admin',label:'Gestión de aliados',href:'/dashboard/admin/aliados',block:'RED DE ALIADOS',paths:['/dashboard/admin/aliados'],grantable:true},
 {id:'comisiones',label:'Config. comisiones',href:'/dashboard/admin/escalas',block:'RED DE ALIADOS',paths:['/dashboard/admin/escalas'],grantable:true},
 {id:'liquidaciones',label:'Cierre de mes (aliados)',href:'/dashboard/admin/liquidaciones',block:'RED DE ALIADOS',paths:['/dashboard/admin/liquidaciones'],grantable:true},
 {id:'users',label:'Gestión de equipo',href:'/admin/users',block:'ADMINISTRACIÓN',paths:['/admin/users'],grantable:false},
 {id:'horarios',label:'Control de asistencia',href:'/dashboard/horarios',block:'ADMINISTRACIÓN',paths:['/dashboard/horarios'],grantable:true},
 {id:'config',label:'Configuración base',href:'/admin/config',block:'ADMINISTRACIÓN',paths:['/admin/config'],grantable:false},
 {id:'clausulas',label:'Cláusulas del contrato',href:'/dashboard/admin/contratos',block:'ADMINISTRACIÓN',paths:['/dashboard/admin/contratos'],grantable:false},
 {id:'siigo',label:'Facturación por sede',href:'/admin/config/siigo',block:'ADMINISTRACIÓN',paths:['/admin/config/siigo'],grantable:false},
 {id:'accesos',label:'Accesos por perfil',href:'/admin/accesos',block:'ADMINISTRACIÓN',paths:['/admin/accesos'],grantable:false},
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

/** Can this user receive extra panels? Accounting and supplier accounts are confined by the database itself. */
export const canReceiveGrants=(profile:Profile)=>!!profile&&!isAccounting(profile.rol)&&!isSupplier(profile.rol);

/** Access the role gives without any manual change (same rules the menu always had). */
export function defaultPanelAccess(panelId:string,profile:Profile){
 const panel=panelById(panelId);
 if(!panel||!profile)return false;
 if(isSupplier(profile.rol))return false;
 if(isAccounting(profile.rol))return panelId==='depositos'||panelId==='caja';
 if(isScopedOperationsAccount(profile.id))return operationsPanels.includes(panel.href);
 if(isAdminProfile(profile as {id?:unknown;rol?:unknown;email?:unknown}))return true;
 return !!panel.staff;
}

/** Final access: a manual "Quitar" always wins; "Permitir" only applies to grantable panels and users that can receive it. */
export function panelAccess(panelId:string,profile:Profile,overrides:PanelOverrides|null|undefined){
 const o=overrides?.[panelId],panel=panelById(panelId);
 if(!panel)return false;
 if(panelId==='accesos')return isAdminProfile(profile as {id?:unknown;rol?:unknown;email?:unknown});
 if(o==='bloqueado')return false;
 if(o==='permitido'&&panel.grantable&&canReceiveGrants(profile))return true;
 return defaultPanelAccess(panelId,profile);
}

/** First panel the user can open, used as landing page when the usual one was removed. */
export function firstAllowedPanel(profile:Profile,overrides:PanelOverrides|null|undefined){
 return PANELS.find(p=>panelAccess(p.id,profile,overrides))?.href||null;
}

export function overridesFromRows(rows:{panel:string;estado:string}[]|null|undefined):PanelOverrides{
 const out:PanelOverrides={};
 for(const r of rows||[])if(r.estado==='permitido'||r.estado==='bloqueado')out[r.panel]=r.estado;
 return out;
}
