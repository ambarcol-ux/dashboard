import {timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
// The old appointment API (/api/citas/*, last used June 2026 by an external bot) only answers callers
// that send CITAS_API_SECRET; without that variable it stays closed.
export function legacyApiAllowed(request:Request,env:NodeJS.ProcessEnv=process.env){
 const secret=env.CITAS_API_SECRET,given=request.headers.get('x-ambar-api-key')||'';
 if(!secret||secret.length<24)return false;
 const a=Buffer.from(given),b=Buffer.from(secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
