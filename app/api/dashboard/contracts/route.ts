import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {DEPOSIT_PROFILE_HEADER, parseDepositProfile} from '@/lib/deposit-profile';
import {CONTRACT_PAGE_SIZE, summarizeDashboard, type DashboardFilters} from '@/lib/dashboard-summary';
import {loadDashboardContracts} from '@/lib/load-dashboard-contracts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = {'Cache-Control':'private, no-store'};
// Only fields required by the existing filters and indicators. No customer details,
// signatures, payment account information, dresses or arrangements in this index.
const SUMMARY_COLUMNS = 'id,created_at,sede_id,estado,saldo,total_multas,numero_factura,fecha_entrega_envio,fecha_cita_medidas,fecha_prueba_final,fecha_pre_xv,tipo_evento,prexv_componentes,prexv_fotografo,prexv_maquilladora,prexv_locacion,prexv_fotografo_agendado,prexv_maquilladora_agendada,prexv_locacion_confirmada';
async function pages(build: () => any) {
  const rows:any[]=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await build().range(offset,offset+499);
    if(error)throw error;
    if(!data)throw new Error('Consulta incompleta.');
    rows.push(...data);if(data.length<500)return rows;
  }
}
const quotedPattern = (value:string) => '"%'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'%"';
export async function GET(req: NextRequest) {
  // Middleware deletes browser-supplied headers and validates Auth + RLS first.
  const profile = parseDepositProfile(req.headers.get(DEPOSIT_PROFILE_HEADER));
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1] || req.cookies.get('sb-access-token')?.value;
  if(!profile || profile.activo===false || !token)return NextResponse.json({error:'Inicia sesión.'},{status:401,headers});
  if(profile.rol.trim().toLowerCase()==='contabilidad')return NextResponse.json({error:'Acceso restringido.'},{status:403,headers});
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    global:{headers:{Authorization:`Bearer ${token}`},fetch:(input,init)=>fetch(input,{...init,cache:'no-store',signal:AbortSignal.any([req.signal,AbortSignal.timeout(20000)])})},
    auth:{persistSession:false,autoRefreshToken:false},
  });
  try{
    const p=req.nextUrl.searchParams;
    const scope=profile.rol!=='admin' && profile.sede_id ? {sedeId:profile.sede_id} : {};
    // Deep links remain accessible even when the contract is not on the current page.
    const contractId=p.get('contractId');
    if(contractId){
      const pattern='"'+contractId.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
      const isId=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(contractId);
      const contracts=await loadDashboardContracts(client,{...scope,...(isId?{ids:[contractId]}:{or:`numero_contrato.eq.${pattern}`})});
      return NextResponse.json({contracts},{headers});
    }
    const today=p.get('today')||'';
    const monthStart=Number(p.get('monthStart')),monthEnd=Number(p.get('monthEnd'));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||!Number.isFinite(Date.parse(today))||!Number.isFinite(monthStart)||!Number.isFinite(monthEnd))return NextResponse.json({error:'Fechas inválidas.'},{status:400,headers});
    const filters:DashboardFilters={
      searchTerm:(p.get('searchTerm')||'').slice(0,200),filtroSede:p.get('filtroSede')||'Todas',
      filtroHito:p.get('filtroHito')||'Todos',filtroRango:p.get('filtroRango')||'Cualquier Fecha',
      fechaDesde:p.get('fechaDesde')||'',fechaHasta:p.get('fechaHasta')||'',filtroAlerta:p.get('filtroAlerta')||'ninguna',
      filtroTipoEvento:p.get('filtroTipoEvento')||'Todos',activeTabLogistica:p.get('activeTabLogistica')||'por_entregar',today,monthStart,monthEnd,
      dayStart:Number(p.get('dayStart')) || Date.parse(today+'T00:00:00Z'),
    };
    let searchOr:string|undefined;
    let relatedIds:string[]=[];
    if(filters.searchTerm){
      const items=await pages(()=>client.from('contrato_items_vestidos').select('id,contrato_id,vestidos!inner(codigo)').ilike('vestidos.codigo',`%${filters.searchTerm}%`).order('id'));
      relatedIds=[...new Set(items.map(i=>i.contrato_id))];
      const pattern=quotedPattern(filters.searchTerm);
      searchOr=`cliente_nombre.ilike.${pattern},cliente_documento.ilike.${pattern},numero_contrato.ilike.${pattern}`;
    }
    const readSummary = (ids?:string[]) => pages(()=>{
      let q=client.from('contratos').select(SUMMARY_COLUMNS).order('created_at',{ascending:false}).order('id');
      if(scope.sedeId)q=q.eq('sede_id',scope.sedeId);
      if(ids)q=q.in('id',ids);else if(searchOr)q=q.or(searchOr);
      return q;
    });
    const readMatchingSummary = async () => {
      const found=await readSummary();
      // Bound dress-code matches to keep PostgREST URLs below proxy limits.
      for(let i=0;i<relatedIds.length;i+=100)found.push(...await readSummary(relatedIds.slice(i,i+100)));
      return [...new Map(found.map(c=>[c.id,c])).values()].sort((a,b)=>
        Date.parse(b.created_at)-Date.parse(a.created_at) || String(a.id).localeCompare(String(b.id)));
    };
    const [rows,deliveries,sedes]=await Promise.all([
      readMatchingSummary(),
      pages(()=>client.from('entregas_bitacora').select('id,contrato_id').order('id')),
      pages(()=>client.from('sedes').select('id').eq('activo',true).order('id')),
    ]);
    const delivered=new Set(deliveries.map(d=>d.contrato_id));
    const index=rows.map(c=>({...c,entregas:delivered.has(c.id)?[true]:[]}));
    const {filtered,summary}=summarizeDashboard(index,sedes,filters);
    const requestedPage=Math.max(1,Math.floor(Number(p.get('page'))||1));
    const page=Math.min(requestedPage,Math.max(1,Math.ceil(summary.total/CONTRACT_PAGE_SIZE)));
    const ids=filtered.slice((page-1)*CONTRACT_PAGE_SIZE,page*CONTRACT_PAGE_SIZE).map(c=>c.id);
    const hydrated=await loadDashboardContracts(client,{...scope,ids});
    const byId=new Map(hydrated.map(c=>[c.id,c]));
    return NextResponse.json({contracts:ids.map(id=>byId.get(id)).filter(Boolean),summary,page,profile},{headers});
  }catch(error){
    console.error('No se pudo cargar la página de contratos:',error);
    return NextResponse.json({error:'No se pudieron cargar los contratos. Intenta actualizar.'},{status:503,headers});
  }
}
