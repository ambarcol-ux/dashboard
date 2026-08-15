import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Enlace inválido' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('contratos').select(`*, quinceanera_name, arreglos(*), vestidos:contrato_items_vestidos(*, vestido:vestidos(*))`).eq('id', id).single();
  if (error || !data) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Enlace inválido' }, { status: 400 });
  const { firmaBase64 } = await request.json();
  if (typeof firmaBase64 !== 'string' || !firmaBase64.startsWith('data:image/png;base64,') || firmaBase64.length > 1_500_000) return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  const { data: contract, error: readError } = await supabaseAdmin.from('contratos').select('id, estado, fecha_disponibilidad_real').eq('id', id).single();
  if (readError || !contract) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
  if (contract.estado === 'firmado') return NextResponse.json({ error: 'El contrato ya fue firmado' }, { status: 409 });
  const { error: updateError } = await supabaseAdmin.from('contratos').update({ estado: 'firmado', firma_base64: firmaBase64, fecha_firma_cliente: new Date().toISOString() }).eq('id', id);
  if (updateError) return NextResponse.json({ error: 'No se pudo guardar la firma' }, { status: 500 });
  await supabaseAdmin.from('bitacora_contratos').insert({ contrato_id: id, accion: 'Bloqueo de Inventario', detalle: `Bloqueo de inventario programado hasta el ${contract.fecha_disponibilidad_real || 'N/A'} por mantenimiento (Post-Firma).` });
  return NextResponse.json({ ok: true });
}
