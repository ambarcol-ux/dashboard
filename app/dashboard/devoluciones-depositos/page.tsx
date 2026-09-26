import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {DEPOSIT_PROFILE_HEADER,parseDepositProfile} from '@/lib/deposit-profile';
import DepositsClient from './DepositsClient';

export default async function DepositsPage(){
 const profile=parseDepositProfile((await headers()).get(DEPOSIT_PROFILE_HEADER));
 if(!profile||profile.activo===false)redirect('/login');
 return <DepositsClient initialProfile={profile}/>;
}
