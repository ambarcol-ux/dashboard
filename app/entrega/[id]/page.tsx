'use client';
import {useEffect,useState} from 'react';
import LegacyPage from './LegacyPage';
import TokenPage from './TokenPage';
export default function Page(){const [token,setToken]=useState<boolean|null>(null);useEffect(()=>{setToken(new URLSearchParams(window.location.hash.slice(1)).has('token'));},[]);return token===null?<p>Cargando…</p>:token?<TokenPage/>:<LegacyPage/>;}
