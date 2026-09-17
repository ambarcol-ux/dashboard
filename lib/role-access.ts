export const DEPOSITS_PATH = '/dashboard/devoluciones-depositos';
export const normalizeRole = (role: unknown) => String(role ?? '').trim().toLowerCase();
export const isAccounting = (role: unknown) => normalizeRole(role) === 'contabilidad';
export const canAccessPath = (role: unknown, path: string) =>
  !isAccounting(role) || path === DEPOSITS_PATH || path === `${DEPOSITS_PATH}/` || path === '/login';
export const homeForRole = (role: unknown) => isAccounting(role) ? DEPOSITS_PATH : '/dashboard';
