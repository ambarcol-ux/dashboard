import {supabase} from './supabase';
export async function deliveryPhotoUrls(paths:string[]){
 if(!paths.length)return [];
 const {data,error}=await supabase.storage.from('fotos-entregas').createSignedUrls(paths,7*24*60*60);
 if(error||!data||data.some(row=>row.error||!row.signedUrl))throw new Error('No se pudieron autorizar las fotos de la entrega.');
 return data.map(row=>row.signedUrl);
}
