import {Buffer} from 'node:buffer';
import {createHmac,timingSafeEqual} from 'node:crypto';
export * from './ally-contract-text';

// Private signing link: authorizes only reading and signing this ally's contract.
// Red VIP allies (referidores) use plain tokens; Aliados Directos use the "d." prefix and their own purpose.
export type AllyKind='vip'|'directo';
const purpose=(kind:AllyKind)=>kind==='directo'?'aliado-directo-v1':'ally-contract-v1';
const sign=(id:string,expires:number,key:string,kind:AllyKind='vip')=>createHmac('sha256',key).update(`${purpose(kind)}:${id}.${expires}`).digest('base64url');
export function allyContractToken(id:string,expires:number,key:string,kind:AllyKind='vip'){
 if(!key||key==='[SENSITIVE]')throw Error('Enlaces no configurados');
 return `${kind==='directo'?'d.':''}${id}.${expires}.${sign(id,expires,key,kind)}`;
}
export function verifyAllyContractToken(token:string,key:string,now=Date.now()):{id:string;expires:number;kind:AllyKind}|null{
 if(!key||key==='[SENSITIVE]')return null;
 const kind:AllyKind=token.startsWith('d.')?'directo':'vip';
 const parts=(kind==='directo'?token.slice(2):token).split('.');
 if(parts.length!==3||!/^[0-9a-f-]{36}$/i.test(parts[0])||!/^\d{10,13}$/.test(parts[1]))return null;
 const expires=Number(parts[1]);if(expires<=now)return null;
 const a=Buffer.from(parts[2]),b=Buffer.from(sign(parts[0],expires,key,kind));
 return a.length===b.length&&timingSafeEqual(a,b)?{id:parts[0],expires,kind}:null;
}
