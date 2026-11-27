import type {MetadataRoute} from 'next';

/** The ERP installable on phones and computers («Agregar a pantalla de inicio»): Ámbar icon, full screen, opens on the dashboard. */
export default function manifest():MetadataRoute.Manifest{
 return {
  name:'Ámbar Couture ERP',
  short_name:'Ámbar',
  description:'ERP de Ámbar Couture: contratos, caja, inventario, citas y aliados.',
  start_url:'/dashboard',
  scope:'/',
  display:'standalone',
  background_color:'#faf8f5',
  theme_color:'#faf8f5',
  lang:'es-CO',
  icons:[
   {src:'/app-icon/192',sizes:'192x192',type:'image/png',purpose:'any'},
   {src:'/app-icon/512',sizes:'512x512',type:'image/png',purpose:'any'},
   {src:'/app-icon/512',sizes:'512x512',type:'image/png',purpose:'maskable'},
  ],
 };
}
