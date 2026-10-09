export const DEPOSITS_PATH = '/dashboard/devoluciones-depositos';
export const normalizeRole = (role: unknown) => String(role ?? '').trim().toLowerCase();
export const isAccounting = (role: unknown) => normalizeRole(role) === 'contabilidad';
export const canAccessPath = (role: unknown, path: string) =>
  !isAccounting(role) || path === DEPOSITS_PATH || path === `${DEPOSITS_PATH}/` || path === '/login';
export const homeForRole = (role: unknown) => isAccounting(role) ? DEPOSITS_PATH : '/dashboard';

// Verified account ID: restrictions persist even if its login email changes.
export const isBogotaOperationsAccount = (id: unknown) => id === 'bd8f61a5-8ecf-4b78-9282-5c7812b4f277';
export const operationsPanels = ['/dashboard','/dashboard/calendario','/disponibilidad','/dashboard/pedidos-estrene','/dashboard/devoluciones-depositos','/admin/inventory'];
export const canAccessAccountPath = (id: unknown, path: string) => !isBogotaOperationsAccount(id) || [...operationsPanels,'/contratos/nuevo','/api/dashboard/contracts','/api/contratos/calendario','/api/send-email','/api/send-code','/login'].includes(path.replace(/\/$/,''));
