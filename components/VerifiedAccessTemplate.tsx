import {headers} from 'next/headers';
import {DEPOSIT_PROFILE_HEADER, parseDepositProfile} from '@/lib/deposit-profile';
import {VerifiedAccessProvider} from './VerifiedAccessProvider';
export default async function VerifiedAccessTemplate({children}: {children: React.ReactNode}) {
  const h = await headers();
  const profile = parseDepositProfile(h.get(DEPOSIT_PROFILE_HEADER));
  const verifiedAt = Number(h.get('x-ambar-profile-verified-at'));
  return <VerifiedAccessProvider initial={profile && verifiedAt ? {profile, verifiedAt} : null}>{children}</VerifiedAccessProvider>;
}
