'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Frame} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import RetablosPanel from '@/components/retablos/RetablosPanel';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {supabase} from '@/lib/supabase';
import styles from '../calendario/calendar.module.css';

export default function RetablosPage(){
 const readAccess=useVerifiedAccess(),router=useRouter();
 const [profile,setProfile]=useState<Record<string,unknown>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void readAccess().then(({profile})=>{if(live)setProfile(profile);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'No pudimos validar tu acceso.');});return()=>{live=false;};},[readAccess]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage="retablos"/><main className={styles.main}>
  <header className={styles.header}><div><Link href="/dashboard" className={styles.back}>Retablos › Panel general</Link><h1><Frame/> Retablos</h1><p>Cada retablo vendido en un contrato, desde que se marca hasta que se entrega.</p></div></header>
  {error?<p role="alert" className={styles.error}>{error}</p>:profile?<RetablosPanel vista="panel"/>:<p role="status" className={styles.empty}>Validando acceso…</p>}
 </main></div>;
}
