'use client';
import {useEffect,useState} from 'react';
import AllyCatalog from '@/components/AllyCatalog';

/** The ally's private catalog (token in the link's #, like Disponibilidad): every store with prices and the link without prices for clients. */
export default function AllyPrivateCatalogPage(){
 const [token,setToken]=useState(''),[error,setError]=useState('');
 useEffect(()=>{
  const t=decodeURIComponent(window.location.hash.slice(1));
  const id=setTimeout(()=>{if(t)setToken(t);else setError('Abre el enlace completo que te envió Ámbar Couture.');},0);
  return()=>clearTimeout(id);
 },[]);
 if(error)return <main className="min-h-screen bg-[#faf8f5] py-8 px-4"><p role="alert" className="max-w-md mx-auto bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold">{error}</p></main>;
 return <AllyCatalog modo="privado" token={token}/>;
}
