'use client';
import {useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {supabase} from '@/lib/supabase';
import styles from '@/app/dashboard/caja/caja.module.css';

export type ShellProfile={id:string;rol:string;sede_id:string|null;nombre:string|null};
type Page='proveedores'|'proveedores-pagos'|'proveedores-catalogo'|'aliados_directos';

/** Page frame for the suppliers module: verified profile, sidebar and header; optionally admin-only. */
export default function SupplierShell({activePage,crumb,title,icon,description,adminOnly,backHref='/dashboard',children}:{activePage:Page;crumb:string;title:string;icon:ReactNode;description:string;adminOnly?:boolean;backHref?:string;children:(profile:ShellProfile)=>ReactNode}){
 const readAccess=useVerifiedAccess(),router=useRouter();
 const [profile,setProfile]=useState<Record<string,unknown>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void readAccess().then(({profile})=>{if(live)setProfile(profile);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'No pudimos validar tu acceso.');});return()=>{live=false;};},[readAccess]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 const rol=String(profile?.rol||'').toLowerCase();
 const shell:ShellProfile|null=profile?{id:String(profile.id),rol,sede_id:(profile.sede_id as string|null)??null,nombre:(profile.nombre as string|null)??null}:null;
 return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage={activePage}/><main className={styles.main}>
  <header className={styles.header}><div><Link href={backHref} className={styles.back}>{backHref==='/dashboard'?crumb:`← ${crumb}`}</Link><h1>{icon} {title}</h1><p>{description}</p></div></header>
  {error?<p role="alert" className={styles.error}>{error}</p>
   :!shell?<p role="status" className={styles.empty}>Validando acceso…</p>
   :adminOnly&&rol!=='admin'?<p role="alert" className={styles.error}>Esta pantalla es solo para administración.</p>
   :children(shell)}
 </main></div>;
}

export async function openSupplierFile(bucket:'documentos_proveedores'|'comprobantes_proveedores',path:string){
 const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path,300);
 if(error||!data?.signedUrl)throw Error('No se pudo abrir el archivo.');
 window.open(data.signedUrl,'_blank','noopener');
}
