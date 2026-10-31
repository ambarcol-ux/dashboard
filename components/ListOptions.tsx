'use client';
import {useLists} from '@/lib/module-config';

/** <option>s of a Configuración list (active values), keeping the current values even if deactivated. */
export default function ListOptions({lista,keep=[]}:{lista:string;keep?:(string|null|undefined)[]}){
 const values=useLists([lista])[lista]||[];
 return <>{Array.from(new Set([...values,...keep.filter((v):v is string=>!!v)])).map(v=><option key={v} value={v}>{v}</option>)}</>;
}
