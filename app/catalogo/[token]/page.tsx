'use client';
import {useParams} from 'next/navigation';
import AllyCatalog from '@/components/AllyCatalog';

/** Catalog an ally shares with their clients: photos, type, size and color, without prices or Ámbar's brand; «Me interesa» opens the ally's WhatsApp. */
export default function AllyClientCatalogPage(){
 const {token}=useParams<{token:string}>();
 return <AllyCatalog modo="clientas" token={String(token||'')}/>;
}
