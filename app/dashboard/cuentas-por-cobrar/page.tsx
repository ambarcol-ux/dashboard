'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {HandCoins} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import CobrosModule from '@/components/CobrosModule';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {supabase} from '@/lib/supabase';
import styles from '../caja/caja.module.css';

export default function CobrosPage(){
 const readAccess=useVerifiedAccess(),router=useRouter();
 const [profile,setProfile]=useState<Record<string,unknown>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void readAccess().then(({profile})=>{if(live)setProfile(profile);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'No pudimos validar tu acceso.');});return()=>{live=false;};},[readAccess]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage="cobros"/><main className={styles.main}>
  <header className={styles.header}><div><Link href="/dashboard/caja" className={styles.back}>Finanzas / Cuentas por cobrar</Link><h1><HandCoins/> Cuentas por cobrar</h1><p>Contratos con saldo pendiente, ordenados por la fecha de entrega del vestido. Alerta a 7 y a 3 días.</p></div></header>
  {error?<p role="alert" className={styles.error}>{error}</p>:profile?<CobrosModule userId={String(profile.id)}/>:<p role="status" className={styles.empty}>Validando acceso…</p>}
 </main></div>;
}
