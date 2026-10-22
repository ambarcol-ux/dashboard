'use client';
import {useEffect,useState} from 'react';
import {blockedVisitDay} from '@/lib/first-visit-calendar';
import styles from '@/app/agendar-primera-cita/visits.module.css';
const weekdays=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const key=(y:number,m:number,d:number)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
/** Month picker for first visits: days closed by the agenda (or, before it loads, Sundays and Monday holidays) are shown and kept blocked. */
export default function VisitDatePicker({label,value,min,max,onChange,closed}:{label:string;value:string;min:string;max:string;onChange:(day:string)=>void;closed?:Record<string,string>|null}){
 const start=value||min;
 const [month,setMonth]=useState(()=>({y:Number(start.slice(0,4)),m:Number(start.slice(5,7))-1}));
 // A prerendered page may start on a stale month; jump to the bookable range once the real date is known.
 useEffect(()=>{setMonth(current=>key(current.y,current.m,31)<min||key(current.y,current.m,1)>max?{y:Number(min.slice(0,4)),m:Number(min.slice(5,7))-1}:current);},[min,max]);
 const first=new Date(Date.UTC(month.y,month.m,1)),days=new Date(Date.UTC(month.y,month.m+1,0)).getUTCDate(),offset=(first.getUTCDay()+6)%7;
 const shift=(n:number)=>setMonth(({y,m})=>({y:y+Math.floor((m+n)/12),m:((m+n)%12+12)%12}));
 const name=first.toLocaleDateString('es-CO',{month:'long',year:'numeric',timeZone:'UTC'}),title=name.charAt(0).toUpperCase()+name.slice(1);
 return <div className={styles.datePicker} role="group" aria-label={label}>
  <span className={styles.dateLabel}>{label}</span>
  <div className={styles.dateHeader}><button type="button" onClick={()=>shift(-1)} disabled={key(month.y,month.m,1)<=min.slice(0,8)+'01'} aria-label="Mes anterior">‹</button><strong>{title}</strong><button type="button" onClick={()=>shift(1)} disabled={key(month.y,month.m,days)>=max} aria-label="Mes siguiente">›</button></div>
  <div className={styles.dateGrid}>{weekdays.map(w=><span key={w} className={styles.weekday}>{w}</span>)}{Array.from({length:offset},(_,i)=><span key={'e'+i}/>)}
   {Array.from({length:days},(_,i)=>{const day=key(month.y,month.m,i+1),blocked=closed?closed[day]||null:blockedVisitDay(day),out=day<min||day>max;
    return <button type="button" key={day} disabled={out||!!blocked} aria-pressed={day===value} title={blocked||undefined} aria-label={`${i+1}${blocked?` · ${blocked}`:''}`} className={`${styles.day} ${blocked&&!out?styles.blockedDay:''} ${day===value?styles.selectedDay:''}`} onClick={()=>onChange(day)}>{i+1}{blocked&&!out&&<small>{closed?blocked:blocked.startsWith('Lunes')?'Festivo':'Cerrado'}</small>}</button>;})}
  </div>
  <p className={styles.dateNote}>{value?`Fecha seleccionada: ${new Date(value+'T12:00:00Z').toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'})}.`:'Selecciona un día disponible.'}{closed?' Los días marcados no tienen atención o ya no tienen cupos.':' Domingos y lunes festivos no hay atención.'}</p>
 </div>;
}
