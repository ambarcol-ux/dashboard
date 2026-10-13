export const DEPOSITS_PATH = '/dashboard/devoluciones-depositos';
export const normalizeRole = (role: unknown) => String(role ?? '').trim().toLowerCase();
export const isAccounting = (role: unknown) => normalizeRole(role) === 'contabilidad';
export const canAccessPath = (role: unknown, path: string) =>
  !isAccounting(role) || path === DEPOSITS_PATH || path === `${DEPOSITS_PATH}/` || path === '/login';
export const homeForRole = (role: unknown) => isAccounting(role) ? DEPOSITS_PATH : '/dashboard';

// Verified account IDs (Bogotá, Villavicencio, Barranquilla, Pereira x3): restrictions persist even if a login email changes.
export const isScopedOperationsAccount = (id: unknown) => id === 'bd8f61a5-8ecf-4b78-9282-5c7812b4f277' || id === 'e6507392-c94a-4b9b-85df-b0050b184b09' || id === 'f5e07ef5-2daf-467e-a56a-2caeaf093c4f' || id === '6fa678ad-dbe1-486a-a3e8-5f818fb06f34' || id === 'be72d188-db7a-4719-bfdf-230010501cb8' || id === '2af2dd92-f559-4858-ac5a-5354e6f93b5e';
export const isAdminProfile = (user: {id?: unknown; rol?: unknown; email?: unknown} | null | undefined) =>
  !isScopedOperationsAccount(user?.id) && !isAccounting(user?.rol) && (normalizeRole(user?.rol) === 'admin' || user?.email === 'dubian.h88@gmail.com');
export const operationsPanels = ['/dashboard','/dashboard/calendario','/dashboard/primeras-citas','/disponibilidad','/dashboard/pedidos-estrene','/dashboard/devoluciones-depositos','/admin/inventory'];
export const canAccessAccountPath = (id: unknown, path: string) => !isScopedOperationsAccount(id) || /^\/dashboard\/pago\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(path) || [...operationsPanels,'/dashboard/calendario/analisis','/contratos/nuevo','/api/dashboard/contracts','/api/contratos/calendario','/api/send-email','/api/send-code','/login'].includes(path.replace(/\/$/,''));
