import {Buffer} from 'node:buffer';
import {createHmac,timingSafeEqual} from 'node:crypto';
export * from './ally-contract-text';

// Private signing link: authorizes only reading and signing this ally's contract.
const sign=(id:string,expires:number,key:string)=>createHmac('sha256',key).update(`ally-contract-v1:${id}.${expires}`).digest('base64url');
export function allyContractToken(id:string,expires:number,key:string){
 if(!key||key==='[SENSITIVE]')throw Error('Enlaces no configurados');
 return `${id}.${expires}.${sign(id,expires,key)}`;
}
export function verifyAllyContractToken(token:string,key:string,now=Date.now()){
 if(!key||key==='[SENSITIVE]')return null;
 const parts=token.split('.');
 if(parts.length!==3||!/^[0-9a-f-]{36}$/i.test(parts[0])||!/^\d{10,13}$/.test(parts[1]))return null;
 const expires=Number(parts[1]);if(expires<=now)return null;
 const a=Buffer.from(parts[2]),b=Buffer.from(sign(parts[0],expires,key));
 return a.length===b.length&&timingSafeEqual(a,b)?{id:parts[0],expires}:null;
}
