import type {SupabaseClient} from '@supabase/supabase-js';
import type {DepositProfile} from './deposit-profile';
export type VerifiedAccess = {profile: DepositProfile; verifiedAt: number};
// A bootstrap is scoped to one page mount and one identity, never a global role cache.
export function createAccessReader(client: SupabaseClient, initial: VerifiedAccess | null) {
  let bootstrap = initial;
  let pending: Promise<{user: any; profile: DepositProfile}> | null = null;
  return function read() {
    if (pending) return pending;
    pending = (async () => {
      const first = bootstrap; bootstrap = null;
      const {data: {session}} = await client.auth.getSession();
      // Local identity is only a matching hint. Permissions came from server Auth + RLS.
      if (first && first.profile.activo !== false && session?.user.id === first.profile.id &&
          Date.now() - first.verifiedAt >= 0 && Date.now() - first.verifiedAt < 30000) {
        return {user: {...session.user, email: first.profile.authEmail}, profile: {...first.profile}};
      }
      const {data: {user}, error} = await client.auth.getUser();
      if (error || !user) throw new Error('Inicia sesión para continuar.');
      const {data: profile, error: profileError} = await client.from('profiles')
        .select('id,nombre,email,rol,sede_id,activo,estado_ficha').eq('id', user.id).single();
      if (profileError || !profile || profile.activo === false) throw new Error('No pudimos verificar tu perfil.');
      return {user, profile};
    })().finally(() => {pending = null;});
    return pending;
  };
}
