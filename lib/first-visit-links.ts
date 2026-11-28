import {Buffer} from 'node:buffer';
import {createHmac,timingSafeEqual} from 'node:crypto';
// Tokens authorize only this appointment's public actions, never access to ERP data.
export function signVisitLink(id:string,expires:number,key:string){
 if(!key||key==='[SENSITIVE]')throw Error('Enlaces no configurados');
 const payload=`${id}.${expires}`;
 return `${payload}.${createHmac('sha256',key).update(`first-visit-v1:${payload}`).digest('base64url')}`;
}
export function verifyVisitLink(token:string,key:string,now=Date.now()){
 if(!key||key==='[SENSITIVE]')return null;
 const parts=token.split('.');
 if(parts.length!==3||! /^[0-9a-f-]{36}$/i.test(parts[0])||!/^\d{10,13}$/.test(parts[1]))return null;
 const expires=Number(parts[1]);if(expires<=now)return null;
 const expected=signVisitLink(parts[0],expires,key).split('.')[2];
 const a=Buffer.from(parts[2]),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b)?{id:parts[0],expires}:null;
}
export function visitManagementLink(origin:string,id:string,expires:number,key:string){
 return `${origin}/agendar-primera-cita/gestionar#${signVisitLink(id,expires,key)}`;
}
export function whatsappPhone(value:string){
 const digits=value.replace(/\D/g,'');return digits.length===10?`57${digits}`:digits;
}
export {noRentalReasons} from './first-visits';

// Document searches issue short-lived rescheduling-only capabilities.
export function signRescheduleLink(id:string,expires:number,key:string){
 return 'r.'+signVisitLink(id,expires,createHmac('sha256',key).update('first-visit-reschedule-only').digest('hex'));
}
export function verifyRescheduleLink(token:string,key:string,now=Date.now()){
 if(!key||!token.startsWith('r.'))return null;
 return verifyVisitLink(token.slice(2),createHmac('sha256',key).update('first-visit-reschedule-only').digest('hex'),now);
}

// Tracked video-call links: open the meeting and register the arrival; they authorize nothing else.
const videoKey=(key:string)=>createHmac('sha256',key).update('first-visit-video-only').digest('hex');
export function visitVideoLink(origin:string,id:string,expires:number,key:string){
 return `${origin}/api/primeras-citas/llegada?t=${signVisitLink(id,expires,videoKey(key))}`;
}
export function verifyVideoLink(token:string,key:string,now=Date.now()){
 return key?verifyVisitLink(token,videoKey(key),now):null;
}

// Favorites link for whoever decides (mom, dad, fiancé): shows only that visit's favorite dresses and their availability for her date.
const favKey=(key:string)=>createHmac('sha256',key).update('first-visit-favorites-only').digest('hex');
export function favoritesLink(origin:string,id:string,expires:number,key:string){
 return `${origin}/favoritos#${signVisitLink(id,expires,favKey(key))}`;
}
export function verifyFavoritesLink(token:string,key:string,now=Date.now()){
 return key?verifyVisitLink(token,favKey(key),now):null;
}
