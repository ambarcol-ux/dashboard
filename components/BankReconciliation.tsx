'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {accountLabel,type CashAccount} from '@/lib/cash';
import {guessColumns,parseCsv,statementLines,type ColumnMap} from '@/lib/bank-statement';
import styles from '@/app/dashboard/caja/caja.module.css';

type Linea={id:string;fecha:string;descripcion:string|null;referencia:string|null;valor:number;saldo:number|null;estado:'pendiente'|'conciliada'|'ignorada';erp_tipo:string|null;nota:string|null;erp_detalle:string|null};
type Erp={erp_tipo:string;erp_id:string;fecha:string;valor:number;detalle:string};
type Data={cuenta:{nombre:string;solo_depositos:boolean};lineas:Linea[];erp_sin_banco:Erp[];extractos:{archivo:string;desde:string;hasta:string;lineas:number;created_at:string}[];saldo_extracto:number|null;custodia_depositos:number|null};
const hoy=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
const ESTADO={pendiente:'Sin cruzar',conciliada:'Cruzada',ignorada:'Ignorada'};
const COLS:[keyof ColumnMap,string][]=[['fecha','Fecha'],['descripcion','Descripción'],['referencia','Referencia'],['valor','Valor (con signo)'],['credito','Entradas'],['debito','Salidas'],['saldo','Saldo']];

/** Finanzas › Bancos y conciliación: upload each account's bank statement and cross it with what the ERP has for that account. */
export default function BankReconciliation(){
 const [cuentas,setCuentas]=useState<CashAccount[]>([]),[cuenta,setCuenta]=useState(''),[desde,setDesde]=useState(()=>hoy().slice(0,8)+'01'),[hasta,setHasta]=useState(hoy);
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[version,setVersion]=useState(0),[filtro,setFiltro]=useState<'todas'|'pendiente'>('pendiente');
 useEffect(()=>{void supabase.rpc('cuentas_dinero_lista').then(({data:d})=>{const list=((d||[]) as CashAccount[]).filter(c=>c.activo&&c.tipo!=='efectivo');setCuentas(list);if(list[0])setCuenta(c=>c||list[0].id);});},[]);
 useEffect(()=>{if(!cuenta)return;let live=true;void supabase.rpc('conciliacion_cuenta',{p_cuenta:cuenta,p_desde:desde,p_hasta:hasta}).then(({data:d,error:e})=>{if(!live)return;if(e){setError(e.message);setData(null);}else{setError('');setData(d as Data);}});return()=>{live=false;};},[cuenta,desde,hasta,version]);
 const reload=useCallback(()=>setVersion(v=>v+1),[]);
 const lineas=useMemo(()=>(data?.lineas||[]).filter(l=>filtro==='todas'||l.estado==='pendiente'),[data,filtro]);
 const t=useMemo(()=>{const ls=data?.lineas||[];return {entra:ls.filter(l=>l.valor>0).reduce((a,l)=>a+Number(l.valor),0),sale:ls.filter(l=>l.valor<0).reduce((a,l)=>a-Number(l.valor),0),
  pend:ls.filter(l=>l.estado==='pendiente').length,erp:(data?.erp_sin_banco||[]).length};},[data]);
 const marcar=async(l:Linea,estado:'ignorada'|'pendiente',nota:string|null)=>{const {error:e}=await supabase.rpc('extracto_linea_marcar',{p_linea:l.id,p_estado:estado,p_nota:nota});if(e)setError(e.message);else reload();};
 const enlazar=async(l:Linea,e:Erp)=>{const {error:er}=await supabase.rpc('extracto_linea_marcar',{p_linea:l.id,p_estado:'conciliada',p_nota:'Cruce manual',p_erp_tipo:e.erp_tipo,p_erp_id:e.erp_id});if(er)setError(er.message);else reload();};
 return <div style={{display:'grid',gap:16}}>
  <section className={styles.card}>
   <div className={styles.toolbar}>
    <label>Cuenta<select value={cuenta} onChange={e=>setCuenta(e.target.value)}>{cuentas.map(c=><option key={c.id} value={c.id}>{accountLabel(c)}{c.solo_depositos?' (depósitos)':''}</option>)}</select></label>
    <label>Desde<input type="date" value={desde} max={hasta} onChange={e=>e.target.value&&setDesde(e.target.value)}/></label>
    <label>Hasta<input type="date" value={hasta} min={desde} onChange={e=>e.target.value&&setHasta(e.target.value)}/></label>
   </div>
   {!cuentas.length&&<p className={styles.help}>No hay cuentas de banco o billetera. Créalas en Cierres de caja › Cuentas.</p>}
  </section>
  {cuenta&&<Cargar cuenta={cuenta} onDone={m=>{setNotice(m);reload();}} onError={setError}/>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
  {data&&<>
   <div className={styles.stats}>
    <div><span>Entró según el banco</span><strong className={styles.in}>{money(t.entra)}</strong></div>
    <div><span>Salió según el banco</span><strong className={styles.out}>{money(t.sale)}</strong></div>
    <div><span>Saldo del extracto</span><strong>{data.saldo_extracto==null?'—':money(Number(data.saldo_extracto))}</strong></div>
    <div><span>Del banco sin cruzar</span><strong className={t.pend?styles.out:''}>{t.pend}</strong></div>
    <div><span>Del ERP sin respaldo en el banco</span><strong className={t.erp?styles.out:''}>{t.erp}</strong></div>
    {data.cuenta.solo_depositos&&<div><span>Depósitos que deberían estar en custodia</span><strong>{money(Number(data.custodia_depositos||0))}</strong></div>}
   </div>
   <section className={styles.card}>
    <h2>Movimientos del banco</h2>
    <div className={styles.toolbar}><label>Ver<select value={filtro} onChange={e=>setFiltro(e.target.value as typeof filtro)}><option value="pendiente">Solo sin cruzar</option><option value="todas">Todos</option></select></label></div>
    <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Fecha</th><th>Descripción</th><th>Valor</th><th>Estado</th><th></th></tr></thead><tbody>
     {lineas.map(l=><tr key={l.id}><td>{l.fecha}</td><td>{l.descripcion}{l.referencia?<small> · {l.referencia}</small>:null}</td>
      <td className={l.valor>0?styles.in:styles.out}>{money(Number(l.valor))}</td>
      <td>{ESTADO[l.estado]}{l.erp_detalle&&<><br/><small>{l.erp_detalle}</small></>}{l.nota&&l.estado!=='conciliada'&&<><br/><small>{l.nota}</small></>}</td>
      <td>{l.estado==='pendiente'?<Acciones linea={l} erp={data.erp_sin_banco} onLink={e=>void enlazar(l,e)} onIgnore={n=>void marcar(l,'ignorada',n)}/>
       :<button className={styles.button} onClick={()=>void marcar(l,'pendiente',null)}>Deshacer</button>}</td></tr>)}
    </tbody></table></div>
    {!lineas.length&&<p className={styles.empty}>{data.lineas.length?'Todo el extracto de este periodo está cruzado.':'Aún no hay extracto cargado para este periodo.'}</p>}
   </section>
   <section className={styles.card}>
    <h2>Del ERP sin respaldo en el banco</h2>
    <p className={styles.help}>Movimientos que el ERP registra en esta cuenta y que no aparecen en el extracto cargado. Si el extracto ya cubre esas fechas, revisa si la plata realmente entró o salió.</p>
    <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Fecha</th><th>Detalle</th><th>Valor</th></tr></thead><tbody>
     {data.erp_sin_banco.map(e=><tr key={e.erp_tipo+e.erp_id}><td>{e.fecha}</td><td>{e.detalle}</td><td className={e.valor>0?styles.in:styles.out}>{money(Number(e.valor))}</td></tr>)}
    </tbody></table></div>
    {!data.erp_sin_banco.length&&<p className={styles.empty}>Nada pendiente.</p>}
   </section>
   {data.extractos.length>0&&<p className={styles.help}>Extractos cargados: {data.extractos.slice(0,5).map(x=>`${x.archivo} (${x.desde} a ${x.hasta}, ${x.lineas} nuevos)`).join(' · ')}</p>}
  </>}
 </div>;
}

function Acciones({linea,erp,onLink,onIgnore}:{linea:Linea;erp:Erp[];onLink:(e:Erp)=>void;onIgnore:(nota:string)=>void}){
 const [modo,setModo]=useState<''|'cruzar'|'ignorar'>(''),[nota,setNota]=useState('');
 const candidatos=erp.filter(e=>Math.sign(Number(e.valor))===Math.sign(Number(linea.valor)));
 if(modo==='cruzar')return <select defaultValue="" onChange={e=>{const x=candidatos.find(c=>c.erp_tipo+c.erp_id===e.target.value);if(x)onLink(x);}}>
  <option value="" disabled>Elige el movimiento del ERP…</option>{candidatos.map(c=><option key={c.erp_tipo+c.erp_id} value={c.erp_tipo+c.erp_id}>{c.fecha} · {money(Number(c.valor))} · {c.detalle.slice(0,60)}</option>)}</select>;
 if(modo==='ignorar')return <span style={{display:'flex',gap:6}}><input value={nota} placeholder="Motivo (ej.: comisión bancaria)" onChange={e=>setNota(e.target.value)}/><button className={styles.button} onClick={()=>onIgnore(nota)}>Ignorar</button></span>;
 return <span style={{display:'flex',gap:6}}><button className={styles.button} onClick={()=>setModo('cruzar')}>Cruzar</button><button className={styles.button} onClick={()=>setModo('ignorar')}>Ignorar</button></span>;
}

function Cargar({cuenta,onDone,onError}:{cuenta:string;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const [rows,setRows]=useState<string[][]|null>(null),[archivo,setArchivo]=useState(''),[header,setHeader]=useState(0),[map,setMap]=useState<ColumnMap|null>(null),[busy,setBusy]=useState(false);
 const leer=async(f:File|undefined)=>{
  if(!f)return;onError('');
  if(!/\.csv$|\.txt$/i.test(f.name)){onError('Sube el extracto en CSV. Si el banco lo da en Excel, ábrelo y guárdalo como «CSV».');return;}
  const r=parseCsv(await f.text());if(r.length<2){onError('El archivo no tiene movimientos.');return;}
  const g=guessColumns(r);setRows(r);setArchivo(f.name);setHeader(g.header);setMap(g.map);
 };
 const lineas=useMemo(()=>rows&&map&&map.fecha>=0?statementLines(rows,header,map):[],[rows,header,map]);
 const cargar=async()=>{
  if(!lineas.length){onError('No se reconocen movimientos: revisa las columnas de fecha y valor.');return;}
  setBusy(true);
  const {data,error}=await supabase.rpc('extracto_cargar',{p_cuenta:cuenta,p_archivo:archivo,p_lineas:lineas});
  setBusy(false);
  if(error){onError(error.message);return;}
  const d=data as {nuevas:number;repetidas:number;conciliadas:number};
  setRows(null);setMap(null);
  onDone(`Extracto cargado: ${d.nuevas} movimientos nuevos (${d.repetidas} ya estaban), ${d.conciliadas} cruzados solos con el ERP.`);
 };
 const cols=rows?.[header]||[];
 return <section className={styles.card}>
  <h2>Cargar extracto</h2>
  <p className={styles.help}>Descarga el extracto de la cuenta en la banca en línea (CSV) y súbelo aquí. Puedes subir el mismo periodo otra vez: lo repetido no se duplica.</p>
  <input type="file" accept=".csv,.txt,text/csv" onChange={e=>{void leer(e.target.files?.[0]);e.target.value='';}}/>
  {rows&&map&&<>
   <div className={styles.row} style={{flexWrap:'wrap'}}>
    <label>Fila de títulos<select value={header} onChange={e=>setHeader(Number(e.target.value))}>{rows.slice(0,10).map((r,i)=><option key={i} value={i}>{i+1}: {r.slice(0,3).join(' · ').slice(0,50)}</option>)}</select></label>
    {COLS.map(([k,label])=><label key={k}>{label}<select value={map[k]} onChange={e=>setMap({...map,[k]:Number(e.target.value)})}><option value={-1}>—</option>{cols.map((c,i)=><option key={i} value={i}>{c||`Columna ${i+1}`}</option>)}</select></label>)}
   </div>
   <p className={styles.help}>Se reconocen {lineas.length} movimientos{lineas[0]?` (ej.: ${lineas[0].fecha} · ${lineas[0].descripcion.slice(0,40)} · ${money(lineas[0].valor)})`:''}. Usa «Valor» si el banco trae una sola columna con signo, o «Entradas» y «Salidas» si las trae separadas.</p>
   <button className={`${styles.button} ${styles.primary}`} disabled={busy||!lineas.length} onClick={()=>void cargar()}>{busy?'Cargando…':`Cargar ${lineas.length} movimientos`}</button>
  </>}
 </section>;
}
