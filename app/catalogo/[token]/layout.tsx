import type {Metadata} from 'next';

/** Catalog an ally shares with their clients: neutral, without Ámbar's name in the tab or the link preview. */
export const metadata:Metadata={title:'Catálogo de vestidos',description:'Vestidos disponibles',robots:{index:false,follow:false},
 openGraph:{title:'Catálogo de vestidos',description:'Vestidos disponibles',images:[]},twitter:{card:'summary',title:'Catálogo de vestidos',description:'Vestidos disponibles',images:[]},icons:{icon:[],apple:[]}};
export default function Layout({children}:{children:React.ReactNode}){return children;}
