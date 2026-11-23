/** Style of a dress (Inventario, WhatsApp AI): silhouette, bodice, neckline, sleeves, details and fabric (fabric optional). */
export const SILUETAS=['Princesa (falda amplia)','Corte A','Sirena','Recto','Corto'] as const;
export const CORPINOS=['Corset','Drapeado','Liso','Con transparencia'] as const;
export const ESCOTES=['Strapless','Corazón','En V','Halter','Hombros caídos','Un hombro','Redondo','Cuadrado'] as const;
export const MANGAS=['Sin mangas','Tiras','Manga corta','Manga larga','Mangas caídas o desmontables'] as const;
export const DETALLES=['Pedrería','Apliques','Flores 3D','Mariposas','Encaje','Lentejuelas','Brillo','Tul','Cola','Capa','Liso (sin detalles)'] as const;
export const TELAS=['Satín','Tul','Encaje','Organza','Chifón (gasa)','Crepé','Lentejuela','Brocado','Terciopelo','Tafetán','Mikado','Otra'] as const;
export type Estilo={silueta:string;corpino:string;escote:string;mangas:string;detalles:string[];tela:string};
export const estiloVacio=():Estilo=>({silueta:'',corpino:'',escote:'',mangas:'',detalles:[],tela:''});
export const estiloDe=(v:{silueta?:string|null;corpino?:string|null;escote?:string|null;mangas?:string|null;detalles?:string[]|null;tela?:string|null}):Estilo=>({silueta:v.silueta||'',corpino:v.corpino||'',escote:v.escote||'',mangas:v.mangas||'',detalles:v.detalles||[],tela:v.tela||''});
/** What is missing, in words, for the «Para guardar, corrige» list. */
export function estiloFalta(e:Estilo){
 const f:string[]=[];
 if(!e.silueta)f.push('silueta');if(!e.corpino)f.push('corpiño');if(!e.escote)f.push('escote');if(!e.mangas)f.push('mangas');if(!e.detalles.length)f.push('detalles');
 return f.length?[`Estilo: elige ${f.join(', ')}.`]:[];
}
/** Short text for the AI and lists: «Princesa · Corset · Corazón · Sin mangas · Pedrería, Apliques». */
export const estiloTexto=(v:{silueta?:string|null;corpino?:string|null;escote?:string|null;mangas?:string|null;detalles?:string[]|null;tela?:string|null})=>[v.silueta,v.corpino,v.escote,v.mangas,(v.detalles||[]).join(', '),v.tela?`tela ${v.tela}`:''].filter(Boolean).join(' · ');

