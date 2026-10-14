'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Wallet} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import CashRegister from '@/components/CashRegister';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {supabase} from '@/lib/supabase';
import styles from './caja.module.css';

export default function CashPage(){
 const readAccess=useVerifiedAccess(),router=useRouter();
 const [profile,setProfile]=useState<Record<string,unknown>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void readAccess().then(({profile})=>{if(live)setProfile(profile);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'No pudimos validar tu acceso.');});return()=>{live=false;};},[readAccess]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage="caja"/><main className={styles.main}>
  <header className={styles.header}><div><Link href="/dashboard" className={styles.back}>Finanzas / Cierres de caja</Link><h1><Wallet/> Cierres de caja</h1><p>Ingresos y egresos diarios de cada sede, cierre con conteo de efectivo y consolidado de todas las sedes.</p></div></header>
  {error?<p role="alert" className={styles.error}>{error}</p>:profile?<CashRegister profile={{id:String(profile.id),rol:String(profile.rol||''),sede_id:(profile.sede_id as string|null)??null}}/>:<p role="status" className={styles.empty}>Validando acceso…</p>}
 </main></div>;
}
