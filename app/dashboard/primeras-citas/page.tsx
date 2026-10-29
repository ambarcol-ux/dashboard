'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {CalendarCheck} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import FirstVisits from '@/components/FirstVisits';
import FollowupSummary from '@/components/FollowupSummary';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {supabase} from '@/lib/supabase';
import {isAdminProfile} from '@/lib/panel-access';
import styles from '../calendario/calendar.module.css';

export default function FirstVisitsPage(){
 const readAccess=useVerifiedAccess(),router=useRouter();
 const [profile,setProfile]=useState<Record<string,unknown>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void readAccess().then(({profile})=>{if(live)setProfile(profile);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'No pudimos validar tu acceso.');});return()=>{live=false;};},[readAccess]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage="primeras-citas"/><main className={styles.main}>
  <header className={styles.header}><div><Link href="/dashboard" className={styles.back}>Operaciones / Primeras visitas</Link><h1><CalendarCheck/> Primeras visitas</h1><p>Citas reservadas y clientas de vitrina sin contrato, su seguimiento y la conversión comercial.</p></div></header>
  {error?<p role="alert" className={styles.error}>{error}</p>:profile?<><FollowupSummary mode="full" /><FirstVisits isAdmin={isAdminProfile(profile)} profile={{id:String(profile.id),sede_id:(profile.sede_id as string|null)??null}}/></>:<p role="status" className={styles.empty}>Validando acceso…</p>}
 </main></div>;
}
