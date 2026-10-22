'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {CalendarCog} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import AgendaPanel from '@/components/agenda/AgendaPanel';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {supabase} from '@/lib/supabase';
import styles from '../../calendario/calendar.module.css';

export default function AgendaSettingsPage(){
 const readAccess=useVerifiedAccess(),router=useRouter();
 const [profile,setProfile]=useState<Record<string,unknown>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void readAccess().then(({profile})=>{if(live)setProfile(profile);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'No pudimos validar tu acceso.');});return()=>{live=false;};},[readAccess]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage="primeras-citas"/><main className={styles.main}>
  <header className={styles.header}><div><Link href="/dashboard/primeras-citas" className={styles.back}>Agenda / Configuración de Primeras Citas</Link><h1><CalendarCog/> Configuración de la agenda</h1><p>Habilita o bloquea días, horas y franjas, define cuántas clientas se atienden por hora (1, 2 o 3) y abre o cierra la agenda virtual y la presencial.</p></div></header>
  {error?<p role="alert" className={styles.error}>{error}</p>:profile?<AgendaPanel/>:<p role="status" className={styles.empty}>Validando acceso…</p>}
 </main></div>;
}
