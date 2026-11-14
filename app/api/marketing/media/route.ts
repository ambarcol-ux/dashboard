export const dynamic='force-dynamic';

/** Photos of the Estudio de contenido served from erp.ambarcouture.com (TikTok only downloads from a verified domain).
 *  Only files of the inventory and marketing buckets. */
export async function GET(request:Request){
 const u=new URL(request.url).searchParams.get('u')||'';
 const base=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;
 if(!u.startsWith(base)||!/^(contenido_marketing|vestidos_fotos)\/[^?#]+$/.test(u.slice(base.length))||u.includes('..'))return new Response('No encontrado',{status:404});
 const r=await fetch(u,{signal:AbortSignal.timeout(20000)});
 if(!r.ok||!r.body)return new Response('No encontrado',{status:404});
 return new Response(r.body,{headers:{'Content-Type':r.headers.get('content-type')||'image/jpeg','Cache-Control':'public, max-age=86400'}});
}
