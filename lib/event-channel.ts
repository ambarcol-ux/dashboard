/** Channel a contract came from, read from its first visit (link mark, ad, «how did you hear») — for Pre XV vs event statistics. */
export type CitaOrigen = { origen?: string | null; origen_enlace?: string | null; como_se_entero?: string | null; anuncio_id?: string | null };
export const TIPOS_EVENTO = ['Evento', 'PreXV', 'Ambos'] as const;
export const TIPO_LABEL: Record<string, string> = { Evento: 'Evento', PreXV: 'Pre XV', Ambos: 'Ambos' };

export function canalDe(c: CitaOrigen | null | undefined) {
  if (!c) return 'Sin cita registrada';
  const o = String(c.origen_enlace || '').toLowerCase(), como = String(c.como_se_entero || '').toLowerCase();
  if (c.anuncio_id) return 'Anuncio de Meta';
  if (o.includes('instagram') || o.startsWith('ig') || como.includes('instagram')) return 'Instagram';
  if (o.includes('messenger') || o.startsWith('fb') || como.includes('facebook')) return 'Facebook / Messenger';
  if (o.includes('whatsapp') || como.includes('whatsapp')) return 'WhatsApp';
  if (o.includes('tiktok') || como.includes('tiktok')) return 'TikTok';
  if (o.startsWith('correo') || o.includes('mail')) return 'Correo';
  if (como.includes('recomend')) return 'Recomendación';
  if (c.origen === 'vitrina' || como.includes('tienda')) return 'Tienda (vitrina)';
  return 'Sin dato de red';
}

/** Social-chat catalog and booking links carry the chat's channel so the visit records it. */
export const marcarCanal = (texto: string, canal: string | null | undefined) =>
  canal && canal !== 'whatsapp' ? texto.replace(/o=ia-whatsapp/g, `o=ia-${canal}`) : texto;
