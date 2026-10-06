'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, RefreshCw, Search, ArrowUpRight, Plus } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { bogotaDay, calendarColumns, contractEvents, dayKey, calendarEventTypes, type ContractEvent } from '@/lib/contract-calendar';
import styles from '../calendario/calendar.module.css';
import ui from './operations.module.css';
import { operationGroupsForContract, operationLabel, operationGroups, matchesOperation, type OperationContract } from '@/lib/operations';
import { hasPrexv, prexvSummary } from '@/lib/prexv';
import { previewContracts, previewSites } from '@/lib/operations-preview';
import ContractPanel from '../calendario/ContractPanel';

type Profile={id:string;nombre:string;email:string;rol:string;sede_id:string|null};
type View='month'|'week'|'agenda'|'contracts';
const dateLabel=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'});
export default function UnifiedOperations({preview=false,source,overview,errorMessage}:{preview?:boolean;overview?:ReactNode;errorMessage?:string;source?:{contracts:OperationContract[];profile:Profile|null;sedes:{id:string;nombre:string}[];loading:boolean;onRefresh:()=>void;onOpen:(id:string)=>void}}){
  const router=useRouter();
  const [profile,setProfile]=useState<Profile|null>(null);
  const [contracts,setContracts]=useState<OperationContract[]>([]);
  const [cursor,setCursor]=useState(()=>new Date());
  const [view,setView]=useState<View>('week');
  const [selected,setSelectedLocal]=useState<{id:string;field:string}|null>(null);
  const setSelected=(value:{id:string;field:string}|null)=>{if(source&&value){source.onOpen(value.id);return;}setSelectedLocal(value);};
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(10);
  const [search,setSearch]=useState('');
  const [type,setType]=useState('');
  const [sede,setSede]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [loadedAt,setLoadedAt]=useState<Date|null>(null);
  const [group,setGroup]=useState('');
  const [prexvOnly,setPrexvOnly]=useState(false);
  const [periodOnly,setPeriodOnly]=useState(false);
  const [sedes,setSedes]=useState<{id:string;nombre:string}[]>([]);
  const inFlight=useRef(false);
  const load=useCallback(async()=>{
    if(source){source.onRefresh();return;}
    if(inFlight.current)return;
    inFlight.current=true;setLoading(true);setError('');
    try{
      if(preview){setContracts(previewContracts());setSedes(previewSites);setLoadedAt(new Date());return;}
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError||!user){router.replace('/login');return;}
      const {data:p,error:profileError}=await supabase.from('profiles').select('id,nombre,email,rol,sede_id').eq('id',user.id).single();
      if(profileError||!p)throw new Error('No pudimos verificar tu perfil. Vuelve a iniciar sesión.');
      p.rol=String(p.rol).toLowerCase();
      if(p.rol!=='admin'&&!p.sede_id)throw new Error('Tu perfil necesita una sede asignada para consultar el calendario.');
      setProfile(p);
      let sitesQuery=supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre');
      if(p.rol!=='admin')sitesQuery=sitesQuery.eq('id',p.sede_id);
      const {data:sites,error:sitesError}=await sitesQuery;
      if(sitesError)throw new Error('No pudimos cargar las sedes. Intenta actualizar.');
      setSedes(sites||[]);
      const rows:OperationContract[]=[];
      for(let offset=0;;offset+=500){
        let query=supabase.from('contratos').select(calendarColumns+',cliente_documento,mantenimientos:mantenimiento_bitacora(vestido_id,tipo,tipo_mantenimiento,estado,completado),entregas:entregas_bitacora(id)').order('id').range(offset,offset+499);
        if(p.rol!=='admin')query=query.eq('sede_id',p.sede_id);
        const {data,error:queryError}=await query;
        if(queryError)throw new Error('No pudimos cargar los contratos. Intenta actualizar nuevamente.');
        const page=(data||[]) as unknown as OperationContract[];rows.push(...page);if(page.length<500)break;
      }
      setContracts(rows);setLoadedAt(new Date());
    }catch(e){setError(e instanceof Error?e.message:'No pudimos cargar el calendario.');}
    finally{inFlight.current=false;setLoading(false);}
  },[router,preview,source]);
  useEffect(()=>{if(source)return;const now=bogotaDay(new Date().toISOString())!;setCursor(new Date(now+'T12:00:00'));void load();},[load,source]);
  useEffect(()=>{setPage(1);},[search,type,sede,group,prexvOnly,periodOnly,cursor,view,pageSize]);
  const sourceContracts=source?.contracts,sourceProfile=source?.profile,sourceSedes=source?.sedes,sourceLoading=source?.loading;
  useEffect(()=>{if(!sourceContracts||!sourceSedes)return;setContracts(sourceContracts);setProfile(sourceProfile||null);setSedes(sourceSedes.filter(s=>sourceProfile?.rol==='admin'||s.id===sourceProfile?.sede_id));setLoading(!!sourceLoading);if(!sourceLoading)setLoadedAt(new Date());},[sourceContracts,sourceProfile,sourceLoading,sourceSedes]);
  const baseContracts=useMemo(()=>contracts.filter(c=>matchesOperation(c,{search,sede,group:'',prexv:prexvOnly,type},hasPrexv)),[contracts,search,sede,prexvOnly,type]);
  const filteredContracts=useMemo(()=>baseContracts.filter(c=>!group||operationGroupsForContract(c).includes(group)),[baseContracts,group]);
  const matching=useMemo(()=>contractEvents(filteredContracts).filter(e=>!type||e.field===type),[filteredContracts,type]);
  const start=new Date(cursor.getFullYear(),cursor.getMonth(),view==='week'?cursor.getDate():1,12);
  if(view==='week')start.setDate(start.getDate()-(start.getDay()+6)%7);
  const end=view==='week'?new Date(start):new Date(cursor.getFullYear(),cursor.getMonth()+1,0,12);
  if(view==='week')end.setDate(end.getDate()+6);
  const visible=matching.filter(e=>e.date>=dayKey(start)&&e.date<=dayKey(end));
  const inPeriod=new Set(visible.map(e=>e.contract.id));
  const listContracts=filteredContracts.filter(c=>!periodOnly||inPeriod.has(c.id));
  const totalResults=view==='contracts'?listContracts.length:visible.length;
  const pageCount=Math.max(1,Math.ceil(totalResults/pageSize));
  const currentPage=Math.min(page,pageCount);
  const paged=visible.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const selectedContract=contracts.find(c=>c.id===selected?.id);
  const navigation=view==='contracts'?listContracts.map(c=>({id:c.id,field:contractEvents([c])[0]?.field||'fecha_evento'})):visible.map(e=>({id:e.contract.id,field:e.field}));
  const selectedIndex=navigation.findIndex(e=>e.id===selected?.id&&(view==='contracts'||e.field===selected?.field));
  const gridStart=new Date(start);if(view!=='week')gridStart.setDate(gridStart.getDate()-(gridStart.getDay()+6)%7);
  const days=Array.from({length:view==='week'?7:Math.ceil(((start.getDay()+6)%7+end.getDate())/7)*7},(_,i)=>{const d=new Date(gridStart);d.setDate(d.getDate()+i);return d;});
  const today=bogotaDay(new Date().toISOString());
  const change=(amount:number)=>setCursor(view==='week'?new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+amount*7,12):new Date(cursor.getFullYear(),cursor.getMonth()+amount,1,12));
  const eventCard=(event:ContractEvent)=><button key={event.id} onClick={()=>setSelected({id:event.contract.id,field:event.field})} className={`${styles.event} ${styles[event.color]}`} title={`${event.label} · ${event.contract.cliente_nombre} · Abrir contrato ${event.contract.numero_contrato}`}><span className={styles.eventType}>{event.label}</span><span className={styles.rowState}>{operationLabel(event.contract)}</span><strong>{event.contract.cliente_nombre}</strong><span>{event.time||'Sin hora asignada'} · {event.contract.numero_contrato}</span><span>Factura: {event.contract.numero_factura||'Sin asignar'}</span><span>Ref.: {event.contract.referencia_vestido||'Sin asignar'}</span>{hasPrexv(event.contract)&&<span>{prexvSummary(event.contract)}</span>}<span>Gestionar · Editar contrato</span>{view==='agenda'&&<span>{event.contract.sede} · Ver contrato <ArrowUpRight size={14}/></span>}</button>;
  const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
  return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage="operaciones"/><main className={styles.main}>
    <header className={styles.header}><div><span className={ui.eyebrow}>{preview?'VISTA DE DISEÑO · DATOS FICTICIOS':'ÁMBAR · OPERACIONES'}</span><h1>Operaciones</h1><p>Contratos, entregas y agenda. Selecciona un contrato para gestionar, editar y consultar su bitácora.</p></div><Link href="/contratos/nuevo" className="flex items-center gap-2 px-5 py-2.5 bg-rose-500 text-white rounded-xl font-black text-sm shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all active:scale-95"><Plus className="w-5 h-5" /> NUEVO CONTRATO</Link><button onClick={()=>void load()} disabled={loading} className={styles.refresh}><RefreshCw size={16} className={loading?styles.spinning:''}/>{loading?'Actualizando…':'Actualizar'}</button></header>
    {overview}
    {errorMessage&&<div role="alert" className={styles.error}>{errorMessage}</div>}
    <div className={ui.summary}><div><span>Contratos encontrados</span><strong>{loading&&!loadedAt?'—':filteredContracts.length}</strong><small>Según sede, búsqueda y estado</small></div><div><span>Actividades del periodo</span><strong>{loading&&!loadedAt?'—':visible.length}</strong><small>Un contrato puede tener varias fechas</small></div><div><span>Contratos sin fechas</span><strong>{loading&&!loadedAt?'—':filteredContracts.filter(c=>!contractEvents([c]).length).length}</strong><small>Disponibles en la lista general</small></div></div>
    <div className={ui.stateTabs} role="group" aria-label="Estado operativo"><button aria-pressed={!group} onClick={()=>setGroup('')}>Todos <b>{baseContracts.length}</b></button>{operationGroups.map(g=><button key={g.id} aria-pressed={group===g.id} onClick={()=>setGroup(g.id)}>{g.label}<b>{baseContracts.filter(c=>operationGroupsForContract(c).includes(g.id)).length}</b></button>)}</div>
    <section className={styles.calendar} aria-label="Panel unificado de operaciones">
      <div className={styles.toolbar}><div className={styles.period}><button onClick={()=>change(-1)} aria-label="Periodo anterior"><ChevronLeft size={18}/></button><button onClick={()=>change(1)} aria-label="Periodo siguiente"><ChevronRight size={18}/></button><h2>{view==='week'?`${dateLabel(dayKey(start))} – ${dateLabel(dayKey(end))}`:cursor.toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</h2><button onClick={()=>setCursor(new Date(today+'T12:00:00'))}>Hoy</button></div><div className={styles.tabs}>{([['contracts','Contratos'],['agenda','Agenda'],['week','Semana'],['month','Mes']] as const).map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div></div>
      <div className={styles.filters}><label className={styles.search}><Search size={17}/><input aria-label="Buscar por nombre, número de factura, cédula, contrato o referencia" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre, factura o cédula"/></label><select aria-label="Sede" value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas mis sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select><label className={styles.check}><input type="checkbox" checked={prexvOnly} onChange={e=>setPrexvOnly(e.target.checked)}/> Solo PRE-XV</label>{view==='contracts'&&<label className={styles.check}><input type="checkbox" checked={periodOnly} onChange={e=>setPeriodOnly(e.target.checked)}/> Solo contratos del periodo</label>}<button className={ui.clear} onClick={()=>{setSearch('');setSede('');setGroup('');setType('');setPrexvOnly(false);setPeriodOnly(false);}}>Limpiar filtros</button></div>
      <div className={styles.typeTabs} role="group" aria-label="Tipos de fecha"><button aria-pressed={!type} onClick={()=>setType('')}>Todas</button>{calendarEventTypes.map(t=><button key={t.field} aria-pressed={type===t.field} onClick={()=>setType(t.field)}>{t.label}</button>)}</div>
      {error?<div role="alert" className={styles.error}>{error}<button onClick={()=>void load()}>Reintentar</button></div>:loading&&!loadedAt?<div className={styles.empty} role="status">Cargando contratos del ERP…</div>:<>
      {view==='contracts'?<div className={styles.bookingList}>
        <div className={styles.listHeading}><span>{periodOnly?'Contratos con actividades en el periodo':'Contratos · Todas las fechas'}</span><span>{listContracts.length} resultados</span></div>
        {listContracts.slice((currentPage-1)*pageSize,currentPage*pageSize).map(c=>{
          const dates=contractEvents([c]);const next=dates.find(e=>e.date>=today!)||dates[dates.length-1];
          return <button key={c.id} className={styles.bookingRow} onClick={()=>setSelected({id:c.id,field:next?.field||'fecha_evento'})}><div className={styles.bookingInfo}><strong>{c.cliente_nombre}</strong><span>{c.numero_contrato} · {sedes.find(s=>s.id===c.sede_id)?.nombre||c.sede||'Sin sede'}</span><span>Factura: {c.numero_factura||'Sin asignar'} · Ref.: {c.referencia_vestido||'Sin asignar'}</span>{hasPrexv(c)&&<span>{prexvSummary(c)}</span>}</div><div className={styles.bookingDate}><strong>{next?dateLabel(next.date):'Sin fecha asignada'}</strong><span>{next?next.label:'Pendiente de programar'}</span></div><span className={styles.rowState}>{operationLabel(c)}</span><ChevronRight size={18}/></button>;
        })}
        {!listContracts.length&&<div className={styles.empty}>No hay contratos para estos filtros. Prueba otra sede o limpia la búsqueda.</div>}
        <div className={styles.pagination}><label><select aria-label="Filas por página" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[10,20,50].map(n=><option key={n}>{n}</option>)}</select> filas por página</label><span>{currentPage} de {pageCount}</span><button disabled={currentPage===1} aria-label="Página anterior" onClick={()=>setPage(currentPage-1)}><ChevronLeft size={17}/></button><button disabled={currentPage===pageCount} aria-label="Página siguiente" onClick={()=>setPage(currentPage+1)}><ChevronRight size={17}/></button></div>
      </div>:view==='agenda'?<div className={styles.bookingList}><div className={styles.listHeading}>Fechas programadas <span>{visible.length} resultados</span></div>{paged.length?paged.map(event=><button key={event.id} className={`${styles.bookingRow} ${selected?.id===event.contract.id&&selected?.field===event.field?styles.activeRow:''}`} onClick={()=>setSelected({id:event.contract.id,field:event.field})}><div className={styles.bookingDate}><strong>{new Date(event.date+'T12:00:00').toLocaleDateString('es-CO',{weekday:'short',day:'numeric',month:'short'})}</strong><span>{event.time||'Sin hora asignada'}</span></div><div className={styles.bookingInfo}><strong>{event.label} · {event.contract.cliente_nombre}</strong><span>{event.contract.numero_contrato} · {event.contract.sede}</span><span>Factura: {event.contract.numero_factura||'Sin asignar'} · Referencia: {event.contract.referencia_vestido||'Sin asignar'}</span>{hasPrexv(event.contract)&&<span>{prexvSummary(event.contract)}</span>}</div><span className={styles.rowState}>{event.contract.estado}</span><ChevronRight size={18}/></button>):<div className={styles.empty}>No hay fechas para estos filtros y este periodo.</div>}<div className={styles.pagination}><label><select aria-label="Filas por página" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[10,20,50].map(n=><option key={n}>{n}</option>)}</select> filas por página</label><span>{currentPage} de {pageCount}</span><button disabled={currentPage===1} aria-label="Página anterior" onClick={()=>setPage(currentPage-1)}><ChevronLeft size={17}/></button><button disabled={currentPage===pageCount} aria-label="Página siguiente" onClick={()=>setPage(currentPage+1)}><ChevronRight size={17}/></button></div></div>:<><div className={styles.gridScroll}><div className={styles.gridInner}><div className={styles.weekdays}>{['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d=><span key={d}>{d}</span>)}</div><div className={`${styles.grid} ${view==='week'?styles.week:''}`}>{days.map(d=><div key={dayKey(d)} className={`${styles.day} ${d.getMonth()!==cursor.getMonth()?styles.outside:''}`}><span className={`${styles.number} ${dayKey(d)===today?styles.today:''}`}>{d.getDate()}</span>{matching.filter(e=>e.date===dayKey(d)).map(eventCard)}</div>)}</div></div></div>{!visible.length&&<div className={styles.empty}>No hay fechas para estos filtros y este periodo.</div>}</>}
      </>}
      <footer className={styles.footer}><span>America/Bogota · Las fechas sin hora se muestran sin inventar un horario.</span><span>{loadedAt?`Actualizado ${loadedAt.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}`:''}</span></footer>
    </section><p className={styles.note}>{preview&&'Ejemplo visual con datos ficticios. Para usar los datos de la copia, inicia sesión en /dashboard/operaciones. '}Selecciona una actividad para abrir la gestión completa: Gestionar, Editar contrato, entregas, devoluciones y bitácora. Los filtros se conservan al cambiar de vista. Usa Actualizar para consultar cambios de otras personas.</p>
  </main>{selectedContract&&selected&&<ContractPanel eventId={`${selected.id}:${selected.field}`} key={`${selected.id}:${selected.field}`} contract={selectedContract} field={selected.field} onClose={()=>setSelected(null)} onSaved={updated=>{setContracts(rows=>rows.map(c=>c.id===updated.id?{...c,...updated}:c));setLoadedAt(new Date());}} canPrevious={selectedIndex>0} canNext={selectedIndex>=0&&selectedIndex<navigation.length-1} onNavigate={direction=>{const event=navigation[selectedIndex+direction];if(event)setSelected(event);}}/>}</div>;
}

