/** Dress photos from file names: «1001 450000.jpg», «QP8RJ1416-frente.png», «1001 $1.610.000.jpg». */
/** Image extension at the end of a file name (not «$3.500.000»). */
const EXT=/\.(jpe?g|png|webp|heic|heif|gif)$/i;
export const PHOTO_FIELDS=['foto_frente','foto_espalda','foto_detalle'] as const;
/** Possible references at the start of a file name (longest first). */
export function codeCandidates(name:string){
 const base=name.replace(EXT,'').trim().toUpperCase();
 return [base.match(/^[A-Z0-9]+(?:-[A-Z0-9]+)*/)?.[0],base.match(/^[A-Z0-9]+/)?.[0]].filter((x,i,a):x is string=>!!x&&a.indexOf(x)===i);
}
/** Price written after the reference (≥ 4 digits, dots or commas as thousands), or null. */
export function priceFromName(name:string,code:string){
 const rest=name.replace(EXT,'').toUpperCase().slice(code.length);
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

export type DressRef={id:string;codigo:string;nombre:string|null;color:string|null;precio_sugerido:number|null};
export type Suggestion={id:string;codigo:string;nombre:string|null;color:string|null;precio:number|null;puntaje:number};
const fold=(t:string)=>t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
/** Likely dresses for a name that does not match a reference exactly («1022AMARIfrent A: $3.500.000»):
 * same leading digits (≥3), then price and color/name words add points. 0–100. */
export function suggestDresses(name:string,dresses:DressRef[],max=3):Suggestion[]{
 const base=fold(name.replace(EXT,'')).trim();
 const lead=base.match(/^[A-Z]{0,4}\d{3,}/)?.[0];
 if(!lead)return [];
 const rest=base.slice(lead.length),word=rest.match(/^[A-Z]{3,}/)?.[0]||'';
 const price=priceFromName(name,lead.length?name.slice(0,lead.length):'');
 const out:Suggestion[]=[];
 for(const d of dresses){
  const code=fold(String(d.codigo||'')).replace(/\s+/g,'');
  if(!code.startsWith(lead)||/^\d/.test(code.slice(lead.length)))continue;
  let score=code===lead?60:50;
  const suffix=code.slice(lead.length);
  if(suffix&&word.startsWith(suffix))score+=10;
  if(price&&Number(d.precio_sugerido)===price)score+=25;
  const text=fold(`${d.color||''} ${d.nombre||''}`);
  if(word.length>=3&&text.split(/[^A-Z]+/).some(w=>w.length>=3&&(w.startsWith(word.slice(0,4))||word.startsWith(w.slice(0,4)))))score+=15;
  out.push({id:String(d.id),codigo:String(d.codigo).trim(),nombre:d.nombre,color:d.color,precio:d.precio_sugerido,puntaje:Math.min(100,score)});
 }
 return out.sort((a,b)=>b.puntaje-a.puntaje).slice(0,max);
}
/** Photo slot hinted by the name: front/frente, espalda/back, detalle. */
export function slotFromName(name:string){
 const t=fold(name);
 return /FRONT|FRENT/.test(t)?'foto_frente':/ESPAL|BACK|POSTER/.test(t)?'foto_espalda':/DETAL/.test(t)?'foto_detalle':null;
}
