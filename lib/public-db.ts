import {createClient} from '@supabase/supabase-js';

// Public pages (contract signing, delivery act, ally sign-up) never touch the database from the
// browser: their API routes use this server client and validate every field they accept.
export function publicServerClient(){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||key==='[SENSITIVE]'||!process.env.NEXT_PUBLIC_SUPABASE_URL)throw Error('NOT_CONFIGURED');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
}
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const publicReply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
/** A PNG signature drawn on the canvas, capped so a request cannot store arbitrary large blobs. */
export const validSignature=(value:unknown):value is string=>typeof value==='string'&&value.startsWith('data:image/png;base64,')&&value.length<=1_500_000;
export async function readJson(request:Request,max=2_000_000){const raw=await request.text();if(raw.length>max)throw Error('TOO_LARGE');return JSON.parse(raw||'{}');}
