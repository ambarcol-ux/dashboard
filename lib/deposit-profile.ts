export const DEPOSIT_PROFILE_HEADER = 'x-ambar-verified-deposit-profile';
export type DepositProfile = {
  authEmail?: string | null;
  id: string;
  rol: string;
  sede_id: string | null;
  nombre: string;
  email: string;
  activo: boolean | null;
  estado_ficha?: string | null;
};

export function parseDepositProfile(value: string | null): DepositProfile | null {
  if (!value) return null;
  try {
    const profile = JSON.parse(decodeURIComponent(value));
    if (typeof profile.id !== 'string' || typeof profile.rol !== 'string' ||
        typeof profile.nombre !== 'string' || typeof profile.email !== 'string' ||
        !(profile.sede_id === null || typeof profile.sede_id === 'string') ||
        !(profile.activo === null || typeof profile.activo === 'boolean')) return null;
    return profile;
  } catch {
    return null;
  }
}
