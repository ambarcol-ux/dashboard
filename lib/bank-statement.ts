/** Bank statement (extracto) read in the browser from the bank's CSV: Bancolombia, Davivienda, Nequi… export different columns, so the
 *  user confirms which column is the date, the description, the value (or debit/credit) and the balance. */
export type StatementLine={fecha:string;descripcion:string;referencia:string;valor:number;saldo:number|null;huella:string};
export type ColumnMap={fecha:number;descripcion:number;referencia:number;valor:number;debito:number;credito:number;saldo:number};

/** Splits a CSV (comma, semicolon or tab; quoted fields) into rows. */
export function parseCsv(text:string):string[][]{
 const src=text.replace(/^﻿/,'');
 const first=src.split(/\r?\n/).find(l=>l.trim())||'';
 const sep=[';','\t',','].map(s=>[s,first.split(s).length] as const).sort((a,b)=>b[1]-a[1])[0][0];
 const rows:string[][]=[];let row:string[]=[],cell='',q=false;
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(q){if(c==='"'){if(src[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;continue;}
  if(c==='"'){q=true;continue;}
  if(c===sep){row.push(cell.trim());cell='';continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell.trim());cell='';if(row.some(x=>x!==''))rows.push(row);row=[];continue;}
  cell+=c;
 }
 row.push(cell.trim());if(row.some(x=>x!==''))rows.push(row);
 return rows;
}

/** Amount in Colombian or international format: «1.234.567,89», «-1,234,567.89», «$ 50.000», «(50.000)». */
export function parseAmount(raw:string):number|null{
 let s=String(raw||'').trim();if(!s)return null;
 const neg=/^\(.*\)$/.test(s)||/^-|-$/.test(s.replace(/[$\s]/g,''));
 s=s.replace(/[^\d.,]/g,'');if(!s)return null;
 const lastDot=s.lastIndexOf('.'),lastComma=s.lastIndexOf(',');
 const dec=Math.max(lastDot,lastComma);
 // A separator is decimal when it is the last one and has 1–2 digits after it.
 if(dec>=0&&s.length-dec-1<=2&&s.length-dec-1>0){s=s.slice(0,dec).replace(/[.,]/g,'')+'.'+s.slice(dec+1);}else s=s.replace(/[.,]/g,'');
 const n=Number(s);return Number.isFinite(n)?(neg?-n:n):null;
}

/** Date as yyyy-mm-dd from «2026-11-03», «03/11/2026», «3/11/26», «20261103». */
export function parseDate(raw:string):string|null{
 const s=String(raw||'').trim();let m;
 if((m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)))return iso(+m[1],+m[2],+m[3]);
 if((m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)))return iso(+m[3]<100?2000+ +m[3]:+m[3],+m[2],+m[1]);
 if((m=s.match(/^(\d{4})(\d{2})(\d{2})$/)))return iso(+m[1],+m[2],+m[3]);
 return null;
}
function iso(y:number,mo:number,d:number){
 if(mo<1||mo>12||d<1||d>31||y<2000||y>2100)return null;
 return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

const norm=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
/** Header row and a first guess of the columns. */
export function guessColumns(rows:string[][]):{header:number;map:ColumnMap}{
 const header=Math.max(0,rows.findIndex(r=>r.some(c=>/fecha/.test(norm(c)))));
 const h=(rows[header]||[]).map(norm);
 const find=(...keys:RegExp[])=>h.findIndex(c=>keys.some(k=>k.test(c)));
 return {header,map:{fecha:find(/fecha/),descripcion:find(/descrip|concepto|detalle|transacc/),referencia:find(/referen|documento|dcto|comprob/),
  valor:find(/^valor|^monto|importe/),debito:find(/debito|cargo|retiro|salida/),credito:find(/credito|abono|deposito|entrada/),saldo:find(/saldo/)}};
}

/** Lines of the statement with the chosen columns; rows without a valid date or value are skipped. */
export function statementLines(rows:string[][],header:number,map:ColumnMap):StatementLine[]{
 const out:StatementLine[]=[];const seen=new Map<string,number>();
 for(const r of rows.slice(header+1)){
  const fecha=parseDate(r[map.fecha]||'');if(!fecha)continue;
  let valor:number|null=null;
  if(map.valor>=0)valor=parseAmount(r[map.valor]||'');
  else{const cr=map.credito>=0?parseAmount(r[map.credito]||'')||0:0,db=map.debito>=0?parseAmount(r[map.debito]||'')||0:0;valor=Math.abs(cr)-Math.abs(db);}
  if(valor===null||valor===0)continue;
  const descripcion=map.descripcion>=0?r[map.descripcion]||'':'',referencia=map.referencia>=0?r[map.referencia]||'':'';
  const saldo=map.saldo>=0?parseAmount(r[map.saldo]||''):null;
  const key=[fecha,descripcion,referencia,valor,saldo??''].join('|');const n=(seen.get(key)||0)+1;seen.set(key,n);
  out.push({fecha,descripcion,referencia,valor,saldo,huella:`${key}|${n}`});
 }
 return out;
}
