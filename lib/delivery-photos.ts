import type {SupabaseClient} from '@supabase/supabase-js';

/** Delivery photos (bucket «fotos-entregas», private): the delivery act keeps the old public link of each photo; it is shown
 *  through a temporary signed link so a photo can't be opened by whoever gets the address. */
export const DELIVERY_PHOTOS_BUCKET='fotos-entregas';
const MARK=`/${DELIVERY_PHOTOS_BUCKET}/`;

/** Storage path of a saved photo (public URL or bare path). */
export function deliveryPhotoPath(saved:string){
 const s=String(saved||'');
 const i=s.indexOf(MARK);
 return decodeURIComponent((i>=0?s.slice(i+MARK.length):s).split('?')[0]);
}

/** Temporary links (1 hour) for the saved photos, in the same order; a photo that can't be signed is left out. */
export async function signDeliveryPhotos(db:SupabaseClient,saved:string[]|null|undefined,seconds=3600):Promise<string[]>{
 const paths=(saved||[]).map(deliveryPhotoPath).filter(Boolean);
 if(!paths.length)return [];
 const {data,error}=await db.storage.from(DELIVERY_PHOTOS_BUCKET).createSignedUrls(paths,seconds);
 if(error||!data)return [];
 return data.map(d=>d.signedUrl).filter((u):u is string=>!!u);
}
