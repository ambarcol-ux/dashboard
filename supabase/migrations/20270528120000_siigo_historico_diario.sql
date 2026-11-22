-- Daily refresh of public.siigo_historico (Trazabilidad / Estado de resultados con fuente Siigo): every night the last 45 days of each
-- store's Siigo (invoices, cash receipts, purchases, journals, credit notes) are re-read and saved (new ones added, changed ones updated,
-- annulled invoices count $0), then linked to their contract. pg_net is asynchronous, so it runs in 4 steps a few minutes apart:
-- 1 token · 2 first page · 3 remaining pages · 4 save and link. Read-only towards Siigo; changes nothing in contracts, payments or cash.
-- Reversible: select cron.unschedule(j) from unnest(array['siigo-historico-1','siigo-historico-2','siigo-historico-3','siigo-historico-4']) j;
--             drop function private.siigo_historico_paso(int); drop function private.siigo_historico_enlazar(); drop table private.siigo_hist_cola;

create table if not exists private.siigo_hist_cola(
 req bigint primary key, sede_id uuid not null, tipo text not null, ep text, pagina int, creado_at timestamptz not null default now());

create or replace function private.siigo_historico_enlazar() returns void
language plpgsql security definer set search_path='' as $$
begin
 with c as (
  select h.id hid, k.id kid,
   (case when exists(select 1 from public.siigo_documentos d where d.contrato_id=k.id and d.tipo='factura' and (d.respuesta->>'id'=h.siigo_id or d.siigo_numero=h.numero)) then 100 else 0 end
   + case when nf<>'' and (nf=h.numero or 'FV-'||nf=h.numero or (nf ~ '^\d+$' and nf::bigint=(h.datos->>'number')::bigint)) then 10 else 0 end
   + case when regexp_replace(coalesce(k.cliente_documento,''),'\D','','g')<>'' and regexp_replace(k.cliente_documento,'\D','','g')=regexp_replace(coalesce(h.tercero_doc,''),'\D','','g') then 5 else 0 end) score,
   abs(coalesce(k.fecha_elaboracion,(k.created_at at time zone 'America/Bogota')::date)-h.fecha) dist
  from public.siigo_historico h join public.contratos k on k.sede_id=h.sede_id
  cross join lateral (select upper(regexp_replace(coalesce(k.numero_factura,''),'\s','','g')) nf) n
  where h.tipo='factura' and h.contrato_id is null and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','cancelada','rechazado')),
 best as (select distinct on (hid) hid,kid from c where score>=10 or (score=5 and dist<=45) order by hid, score desc, dist)
 update public.siigo_historico h set contrato_id=b.kid from best b where b.hid=h.id;

 update public.siigo_historico r set contrato_id=f.contrato_id from public.siigo_historico f
 where r.tipo='recibo' and r.contrato_id is null and f.tipo='factura' and f.sede_id=r.sede_id and f.contrato_id is not null
  and f.numero=(select (i->'due'->>'prefix')||'-'||(i->'due'->>'consecutive') from jsonb_array_elements(r.datos->'items') i limit 1);

 with c as (select distinct on (h.id) h.id hid, k.id kid from public.siigo_historico h join public.contratos k on k.sede_id=h.sede_id
  where h.tipo in ('recibo','nota_credito') and h.contrato_id is null and regexp_replace(coalesce(k.cliente_documento,''),'\D','','g')<>''
   and regexp_replace(k.cliente_documento,'\D','','g')=regexp_replace(coalesce(h.tercero_doc,''),'\D','','g')
   and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','cancelada','rechazado')
  order by h.id, abs(coalesce(k.fecha_elaboracion,(k.created_at at time zone 'America/Bogota')::date)-h.fecha))
 update public.siigo_historico h set contrato_id=c.kid from c where c.hid=h.id;
end $$;

create or replace function private.siigo_historico_paso(p_paso int) returns int
language plpgsql security definer set search_path='' as $$
declare n int:=0; desde text:=to_char((now() at time zone 'America/Bogota')::date-45,'YYYY-MM-DD');
begin
 if p_paso=1 then
  insert into private.siigo_hist_cola(req,sede_id,tipo)
  select net.http_post(url:='https://api.siigo.com/auth',headers:=jsonb_build_object('Content-Type','application/json','Partner-Id',c.partner_id),
    body:=jsonb_build_object('username',c.usuario_api,'access_key',c.access_key),timeout_milliseconds:=20000), c.sede_id, 'auth'
  from private.credenciales_siigo c join public.sedes s on s.id=c.sede_id where s.activo;
  get diagnostics n=row_count;
 elsif p_paso in (2,3) then
  insert into private.siigo_hist_cola(req,sede_id,tipo,ep,pagina)
  select net.http_get(url:='https://api.siigo.com/v1/'||e.ep||'?date_start='||desde||'&page_size=100&page='||g.p,
    headers:=jsonb_build_object('Authorization','Bearer '||(r.content::jsonb->>'access_token'),'Partner-Id',c.partner_id),timeout_milliseconds:=60000),
   a.sede_id, e.tipo, e.ep, g.p
  from private.siigo_hist_cola a join net._http_response r on r.id=a.req and r.status_code=200
  join private.credenciales_siigo c on c.sede_id=a.sede_id
  cross join (values ('invoices','factura'),('vouchers','recibo'),('purchases','compra'),('journals','comprobante'),('credit-notes','nota_credito')) e(ep,tipo)
  left join lateral (select x.req from private.siigo_hist_cola x where x.sede_id=a.sede_id and x.ep=e.ep and x.pagina=1 and x.creado_at>now()-interval '3 hours' order by x.creado_at desc limit 1) p1 on true
  left join net._http_response r1 on r1.id=p1.req
  cross join lateral generate_series(case when p_paso=2 then 1 else 2 end,
    case when p_paso=2 then 1 else greatest(ceil(coalesce((r1.content::jsonb->'pagination'->>'total_results')::numeric,0)/100)::int,1) end) g(p)
  where a.tipo='auth' and a.creado_at>now()-interval '3 hours' and (p_paso=2 or p1.req is not null);
  get diagnostics n=row_count;
 elsif p_paso=4 then
  insert into public.siigo_historico(sede_id,tipo,siigo_id,numero,fecha,tercero_doc,tercero_nombre,total,datos)
  select q.sede_id, q.tipo, e->>'id', e->>'name', (e->>'date')::date,
   coalesce(e->'customer'->>'identification', e->'supplier'->>'identification', e->'items'->0->'customer'->>'identification'),
   coalesce(e->'customer'->'name'->>0, e->'supplier'->>'name', e->'customer'->>'commercial_name'),
   case when coalesce((e->>'annulled')::boolean,false) then 0
    when q.tipo='comprobante' then coalesce((select sum((i->>'value')::numeric) from jsonb_array_elements(coalesce(e->'items','[]')) i where i->'account'->>'movement'='Debit'),0)
    else coalesce((e->>'total')::numeric,(e->'payment'->>'value')::numeric,0) end,
   e
  from private.siigo_hist_cola q join net._http_response r on r.id=q.req and r.status_code=200
  cross join lateral jsonb_array_elements(coalesce(r.content::jsonb->'results','[]')) e
  where q.tipo<>'auth' and q.creado_at>now()-interval '3 hours' and (e->>'date')::date>=date '2026-04-01'
  on conflict (sede_id,tipo,siigo_id) do update set numero=excluded.numero, fecha=excluded.fecha, tercero_doc=excluded.tercero_doc,
   tercero_nombre=excluded.tercero_nombre, total=excluded.total, datos=excluded.datos, importado_at=now()
   where public.siigo_historico.datos is distinct from excluded.datos;
  get diagnostics n=row_count;
  perform private.siigo_historico_enlazar();
 end if;
 return n;
end $$;
revoke all on function private.siigo_historico_paso(int) from public, anon, authenticated;
revoke all on function private.siigo_historico_enlazar() from public, anon, authenticated;

-- 02:00, 02:05, 02:10 and 02:20 Bogotá (07:xx UTC).
select cron.schedule('siigo-historico-1','0 7 * * *','select private.siigo_historico_paso(1)');
select cron.schedule('siigo-historico-2','5 7 * * *','select private.siigo_historico_paso(2)');
select cron.schedule('siigo-historico-3','10 7 * * *','select private.siigo_historico_paso(3)');
select cron.schedule('siigo-historico-4','20 7 * * *','select private.siigo_historico_paso(4)');
