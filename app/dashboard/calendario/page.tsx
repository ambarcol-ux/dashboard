'use client';
import DressThumb from '@/components/DressThumb';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Search, ArrowUpRight } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { bogotaDay, calendarColumns, contractEvents, dayKey, calendarEventTypes, type CalendarContract, type ContractEvent } from '@/lib/contract-calendar';
import styles from './calendar.module.css';
import { hasPrexv, prexvSummary } from '@/lib/prexv';
import ContractPanel from './ContractPanel';

type Profile={id:string;nombre:string;email:string;rol:string;sede_id:string|null};
type View='month'|'week'|'agenda';
const dateLabel=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'});
export default function ContractCalendar(){
  const readAccess = useVerifiedAccess();
  const router=useRouter();
  const [profile,setProfile]=useState<Profile|null>(null);
  const [availableSites,setAvailableSites]=useState<{id:string;nombre:string}[]>([]);
  const [contracts,setContracts]=useState<CalendarContract[]>([]);
  const [cursor,setCursor]=useState(()=>new Date());
  const [view,setView]=useState<View>('agenda');
  const [selected,setSelected]=useState<{id:string;field:string;eventId:string}|null>(null);
  const currentDay=useRef('');
  const [today,setToday]=useState('');
  const [search,setSearch]=useState('');
  const [type,setType]=useState('');
  const [sede,setSede]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [loadedAt,setLoadedAt]=useState<Date|null>(null);
  const [showCancelled,setShowCancelled]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const {profile: p} = await readAccess();
      p.rol=String(p.rol).toLowerCase();
      if(p.rol!=='admin'&&!p.sede_id)throw new Error('Tu perfil necesita una sede asignada para consultar el calendario.');
      setProfile(p);
      const {data:sites,error:sitesError}=await supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre');
      if(sitesError)throw new Error('No pudimos cargar las sedes. Intenta actualizar.');
      setAvailableSites(sites||[]);
      const rows:CalendarContract[]=[];
      for(let offset=0;;offset+=500){
        let query=supabase.from('contratos').select(calendarColumns).order('id').range(offset,offset+499);
        if(p.rol!=='admin')query=query.eq('sede_id',p.sede_id);
        const {data,error:queryError}=await query;
        if(queryError)throw new Error('No pudimos cargar los contratos. Intenta actualizar nuevamente.');
        const page=(data||[]) as unknown as CalendarContract[];rows.push(...page);if(page.length<500)break;
      }
      setContracts(rows);setLoadedAt(new Date());
    }catch(e){setError(e instanceof Error?e.message:'No pudimos cargar el calendario.');}
    finally{setLoading(false);}
  },[router,readAccess]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    const syncDay=()=>{
      const now=bogotaDay(new Date().toISOString())!;
      if(currentDay.current!==now){
        currentDay.current=now;setToday(now);setCursor(new Date(now+'T12:00:00'));
      }
    };
    syncDay();
    window.addEventListener('focus',syncDay);document.addEventListener('visibilitychange',syncDay);
    const timer=window.setInterval(syncDay,1000);
    return()=>{window.removeEventListener('focus',syncDay);document.removeEventListener('visibilitychange',syncDay);window.clearInterval(timer);};
  },[]);
  useEffect(()=>{
    // Automatic refreshes share one cap: at most one full reload every 2 minutes and never two at once,
    // so tabs switching focus cannot pile up contract reloads on the database. The buttons still reload at once.
    let running=false,last=Date.now();
    const refresh=()=>{
      if(document.visibilityState!=='visible'||running||Date.now()-last<120000)return;
      running=true;last=Date.now();void load().finally(()=>{running=false;last=Date.now();});
    };
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    const timer=window.setInterval(refresh,30000);
    return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.clearInterval(timer);};
  },[load]);
  const allEvents=useMemo(()=>contractEvents(contracts),[contracts]);
  const matching=useMemo(()=>allEvents.filter(e=>{
    const c=e.contract;return (!type||e.field===type)&&(!sede||c.sede===sede)&&(showCancelled||!['cancelado','cancelada','anulado','anulada'].includes(c.estado.toLowerCase()))&&`${c.cliente_nombre} ${c.quinceanera_name||''} ${c.numero_contrato} ${c.numero_factura||''} ${c.referencia_vestido||''} ${(c.items||[]).map(i=>i.vestido?.codigo||'').join(' ')}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'));
  }),[allEvents,type,sede,showCancelled,search]);
  const start=new Date(cursor.getFullYear(),cursor.getMonth(),view!=='month'?cursor.getDate():1,12);
  if(view==='week')start.setDate(start.getDate()-(start.getDay()+6)%7);
  const end=view!=='month'?new Date(start):new Date(cursor.getFullYear(),cursor.getMonth()+1,0,12);
  if(view!=='month')end.setDate(end.getDate()+6);
  const visible=matching.filter(e=>e.date>=dayKey(start)&&e.date<=dayKey(end));
  const selectedContract=contracts.find(c=>c.id===selected?.id);
  const selectedIndex=visible.findIndex(e=>e.id===selected?.eventId);
  const gridStart=new Date(start);if(view==='month')gridStart.setDate(gridStart.getDate()-(gridStart.getDay()+6)%7);
  const days=Array.from({length:view!=='month'?7:Math.ceil(((start.getDay()+6)%7+end.getDate())/7)*7},(_,i)=>{const d=new Date(gridStart);d.setDate(d.getDate()+i);return d;});
  const change=(amount:number)=>setCursor(view!=='month'?new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+amount*7,12):new Date(cursor.getFullYear(),cursor.getMonth()+amount,1,12));
  // References of the contract's dresses (fallback: the contract's free-text reference).
  const eventReference=(event:ContractEvent)=>{
    const refs=Array.from(new Set((event.contract.items||[]).map(i=>i.vestido?.codigo).filter(Boolean)));
    return refs.length?refs.join(' · '):(event.contract.referencia_vestido||'Sin asignar');
  };
  // Dress photos (front, else any loaded photo) to recognize the contract at a glance.
  const eventPhotos=(event:ContractEvent)=>(event.contract.items||[]).map(i=>i.vestido).filter(v=>!!v)
    .map(v=>({codigo:v!.codigo||'',url:v!.foto_frente||v!.imagen_url||v!.foto_espalda||v!.foto_detalle||''})).filter(f=>f.url).slice(0,3);
  const eventCard=(event:ContractEvent)=><button key={event.id} onClick={()=>setSelected({id:event.contract.id,field:event.field,eventId:event.id})} className={`${styles.event} ${styles[event.color]}`} title={`${event.label} · ${event.contract.cliente_nombre} · Abrir contrato ${event.contract.numero_contrato}`}><span className={styles.eventType}>{event.label}</span><strong>{event.contract.cliente_nombre}</strong><span>{event.time||'Sin hora asignada'} · {event.contract.numero_contrato}</span><span>Factura: {event.contract.numero_factura||'Sin asignar'}</span><span>Ref.: {eventReference(event)}</span>{hasPrexv(event.contract)&&<span>{prexvSummary(event.contract)}</span>}{view==='agenda'&&<span>{event.contract.sede} · Ver contrato <ArrowUpRight size={14}/></span>}</button>;
  const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
  return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage="calendario"/><main className={styles.main}>
    <header className={styles.header}><div><Link href="/dashboard" className={styles.back}>Contratos / Calendario</Link><h1><CalendarDays/> Calendario de contratos</h1><p>Pruebas, entregas y fechas de cada cliente de Ámbar.</p></div><button onClick={()=>void load()} disabled={loading} className={styles.refresh}><RefreshCw size={16} className={loading?styles.spinning:''}/> {loading?'Actualizando…':'Actualizar'}</button></header>
    <div className={styles.stats}><div><span>Contratos en este periodo</span><strong>{new Set(visible.map(e=>e.contract.id)).size}</strong></div><div><span>Pruebas de medidas</span><strong>{visible.filter(e=>e.field==='fecha_cita_medidas').length}</strong></div><div><span>Pruebas finales</span><strong>{visible.filter(e=>e.field==='fecha_prueba_final').length}</strong></div><div><span>Fechas programadas</span><strong>{visible.length}</strong></div></div>
    <section className={styles.calendar} aria-label="Calendario de contratos">
      <div className={styles.toolbar}><div className={styles.period}><button onClick={()=>change(-1)} aria-label="Periodo anterior"><ChevronLeft size={18}/></button><button onClick={()=>change(1)} aria-label="Periodo siguiente"><ChevronRight size={18}/></button><h2>{view!=='month'?`${dateLabel(dayKey(start))} – ${dateLabel(dayKey(end))}`:cursor.toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</h2><button onClick={()=>setCursor(new Date(today+'T12:00:00'))}>Hoy</button></div><div className={styles.tabs}>{([['month','Mes'],['week','Semana'],['agenda','Día a día']] as const).map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div></div>
      <div className={styles.filters}><label className={styles.search}><Search size={17}/><input aria-label="Buscar cliente, contrato, factura o referencia" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente, contrato, factura o referencia"/></label><select aria-label="Sede" value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas las sedes disponibles</option>{availableSites.map(s=><option key={s.id} value={s.nombre}>{s.nombre}</option>)}</select><label className={styles.check}><input type="checkbox" checked={showCancelled} onChange={e=>setShowCancelled(e.target.checked)}/> Incluir cancelados</label></div>
      <div className={styles.typeTabs} role="group" aria-label="Tipos de fecha"><button aria-pressed={!type} onClick={()=>setType('')}>Todas</button>{calendarEventTypes.map(t=><button key={t.field} aria-pressed={type===t.field} onClick={()=>setType(t.field)}>{t.label}</button>)}</div>
      {error?<div role="alert" className={styles.error}>{error}<button onClick={()=>void load()}>Reintentar</button></div>:loading&&!loadedAt?<div className={styles.empty} role="status">Cargando contratos del ERP…</div>:<>
      {view==='agenda'?<div className={styles.bookingList}><div className={styles.listHeading}>Agenda de siete días <span>{visible.length} fechas programadas</span></div>{days.map(day=>{const key=dayKey(day);const events=visible.filter(event=>event.date===key);return <section key={key} aria-label={dateLabel(key)}><div className={styles.listHeading}><strong>{key===today?'Hoy · ':''}{day.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'})}</strong><span>{events.length} actividades</span></div>{events.length?events.map(event=><button key={event.id} className={`${styles.bookingRow} ${selected?.eventId===event.id?styles.activeRow:''}`} onClick={()=>setSelected({id:event.contract.id,field:event.field,eventId:event.id})}><div className={styles.bookingDate}><strong>{new Date(event.date+'T12:00:00').toLocaleDateString('es-CO',{weekday:'short',day:'numeric',month:'short'})}</strong><span>{event.time||'Sin hora asignada'}</span></div><div className={styles.bookingInfo}><strong>{event.label} · {event.contract.cliente_nombre}</strong><span>{event.contract.numero_contrato} · {event.contract.sede}</span><span>Factura: {event.contract.numero_factura||'Sin asignar'} · Referencia: {eventReference(event)}</span>{eventPhotos(event).length>0&&<span style={{display:'flex',gap:6,marginTop:4}}>{eventPhotos(event).map((f,i)=><DressThumb key={i} src={f.url} alt={f.codigo} title={f.codigo} style={{width:48,height:64,objectFit:'cover',borderRadius:8,border:'1px solid #eee'}}/>)}</span>}{hasPrexv(event.contract)&&<span>{prexvSummary(event.contract)}</span>}</div><span className={styles.rowState}>{event.contract.estado}</span><ChevronRight size={18}/></button>):<div className={styles.empty}>Sin actividades programadas para este día con los filtros actuales.</div>}</section>;})}</div>:<><div className={styles.gridScroll}><div className={styles.gridInner}><div className={styles.weekdays}>{['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d=><span key={d}>{d}</span>)}</div><div className={`${styles.grid} ${view==='week'?styles.week:''}`}>{days.map(d=><div key={dayKey(d)} className={`${styles.day} ${d.getMonth()!==cursor.getMonth()?styles.outside:''}`}><span className={`${styles.number} ${dayKey(d)===today?styles.today:''}`}>{d.getDate()}</span>{matching.filter(e=>e.date===dayKey(d)).map(eventCard)}</div>)}</div></div></div>{!visible.length&&<div className={styles.empty}>No hay fechas para estos filtros y este periodo.</div>}</>}
      </>}
      <footer className={styles.footer}><span>America/Bogota · Las fechas sin hora se muestran sin inventar un horario.</span><span>{loadedAt?`Actualizado ${loadedAt.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}`:''}</span></footer>
    </section><p className={styles.note}>Selecciona una fila para consultar y editar el contrato en el panel lateral. La agenda abre en hoy y avanza automáticamente al cambiar el día en Colombia. Los cambios del ERP se actualizan al volver a esta página y cada minuto.</p>
  </main>{selectedContract&&selected&&<ContractPanel key={selected.eventId} contract={selectedContract} field={selected.field} eventId={selected.eventId} onClose={()=>setSelected(null)} onSaved={updated=>{setContracts(rows=>rows.map(c=>c.id===updated.id?updated:c));setLoadedAt(new Date());}} canPrevious={selectedIndex>0} canNext={selectedIndex>=0&&selectedIndex<visible.length-1} onNavigate={direction=>{const event=visible[selectedIndex+direction];if(event)setSelected({id:event.contract.id,field:event.field,eventId:event.id});}}/>}</div>;
}


