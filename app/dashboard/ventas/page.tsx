'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ShoppingBag} from 'lucide-react';
import {Toaster} from 'sonner';
import Sidebar from '@/components/Sidebar';
import SalesModule from '@/components/SalesModule';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {supabase} from '@/lib/supabase';
import styles from '../caja/caja.module.css';

export default function SalesPage(){
 const readAccess=useVerifiedAccess(),router=useRouter();
 const [profile,setProfile]=useState<Record<string,unknown>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void readAccess().then(({profile})=>{if(live)setProfile(profile);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'No pudimos validar tu acceso.');});return()=>{live=false;};},[readAccess]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 return <div className={styles.shell}><Toaster richColors position="top-right"/><Sidebar user={profile} handleLogout={logout} activePage="caja"/><main className={styles.main}>
  <header className={styles.header}><div><Link href="/contratos/nuevo" className={styles.back}>Nuevo contrato / Venta</Link><h1><ShoppingBag/> Venta de vestidos</h1><p>Venta de contado sin contrato: entra a la caja del día, cuenta en Metas y Ventas y queda pendiente para la factura electrónica en Siigo (código del vestido + V).</p></div></header>
  {error?<p role="alert" className={styles.error}>{error}</p>:profile?<SalesModule isAdmin={String(profile.rol||'').toLowerCase()==='admin'}/>:<p role="status" className={styles.empty}>Validando acceso…</p>}
 </main></div>;
}
