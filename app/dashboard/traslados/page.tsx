'use client';
import {Suspense,useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowLeftRight} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import TransfersModule from '@/components/TransfersModule';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {supabase} from '@/lib/supabase';
import styles from '../caja/caja.module.css';

export default function TransfersPage(){
 const readAccess=useVerifiedAccess(),router=useRouter();
 const [profile,setProfile]=useState<Record<string,unknown>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void readAccess().then(({profile})=>{if(live)setProfile(profile);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'No pudimos validar tu acceso.');});return()=>{live=false;};},[readAccess]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage="traslados"/><main className={styles.main}>
  <header className={styles.header}><div><Link href="/admin/inventory" className={styles.back}>Inventario / Traslados</Link><h1><ArrowLeftRight/> Traslados</h1><p>Préstamos y traslados definitivos de vestidos entre sedes: solicitud, aprobación, envío, recepción y devolución.</p></div></header>
  {error?<p role="alert" className={styles.error}>{error}</p>:profile?<Suspense fallback={null}><TransfersModule profile={{id:String(profile.id),sede_id:(profile.sede_id as string|null)??null}}/></Suspense>:<p role="status" className={styles.empty}>Validando acceso…</p>}
 </main></div>;
}
