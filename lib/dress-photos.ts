/** Dress photos from file names: «1001 450000.jpg», «QP8RJ1416-frente.png», «1001 $1.610.000.jpg». */
export const PHOTO_FIELDS=['foto_frente','foto_espalda','foto_detalle'] as const;
/** Possible references at the start of a file name (longest first). */
export function codeCandidates(name:string){
 const base=name.replace(/\.[^.]+$/,'').trim().toUpperCase();
 return [base.match(/^[A-Z0-9]+(?:-[A-Z0-9]+)*/)?.[0],base.match(/^[A-Z0-9]+/)?.[0]].filter((x,i,a):x is string=>!!x&&a.indexOf(x)===i);
}
/** Price written after the reference (≥ 4 digits, dots or commas as thousands), or null. */
export function priceFromName(name:string,code:string){
 const rest=name.replace(/\.[^.]+$/,'').toUpperCase().slice(code.length);
 const m=rest.match(/\d[\d.,]{3,}/);
 if(!m)return null;
 const n=Number(m[0].replace(/[.,](\d{3})(?=([.,]\d{3})*$)/g,'$1').replace(/[^\d]/g,''));
 return Number.isFinite(n)&&n>=1000?n:null;
}
/** Google Drive folder id from a shared link or a raw id. */
export function driveFolderId(link:string){
 const t=link.trim();
 return t.match(/\/folders\/([A-Za-z0-9_-]{10,})/)?.[1]||t.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1]||(/^[A-Za-z0-9_-]{10,}$/.test(t)?t:null);
}
