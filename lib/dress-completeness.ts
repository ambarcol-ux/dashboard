/** Complete record rule for dresses and accessories in contracts: warning until FICHA_PLAZO, block from then on (administration can authorize a temporary exception). */
export const FICHA_PLAZO = '2026-12-11';
export const EXCEPCION_DIAS = 7;

export type FichaVestido = { clasificacion_id?: unknown; nombre?: unknown; talla?: unknown; color?: unknown; precio_sugerido?: unknown; foto_frente?: unknown; foto_espalda?: unknown; foto_detalle?: unknown };

/** What is missing in the record, in words to fix it. */
export function fichaFaltantes(v: FichaVestido) {
  const out: string[] = [], txt = (x: unknown) => String(x ?? '').trim();
  if (!v.clasificacion_id) out.push('clasificación');
  if (!txt(v.nombre)) out.push('nombre');
  if (!txt(v.talla)) out.push('talla');
  if (!txt(v.color)) out.push('color');
  if (!(Number(v.precio_sugerido) > 0)) out.push('precio de alquiler');
  const fotos = ([['foto_frente', 'frente'], ['foto_espalda', 'espalda'], ['foto_detalle', 'detalle']] as const).filter(([k]) => !txt(v[k])).map(([, l]) => l);
  if (fotos.length) out.push(`foto${fotos.length > 1 ? 's' : ''} de ${fotos.join(', ')}`);
  return out;
}

/** Colombia date (YYYY-MM-DD). */
const hoyCo = (now = new Date()) => new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
export const fichaBloquea = (now = new Date()) => hoyCo(now) >= FICHA_PLAZO;
export const diasParaPlazo = (now = new Date()) => Math.max(0, Math.ceil((Date.parse(`${FICHA_PLAZO}T05:00:00Z`) - now.getTime()) / 86400000));
export const plazoTexto = () => new Date(`${FICHA_PLAZO}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
