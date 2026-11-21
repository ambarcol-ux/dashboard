-- Cierre de caja con conteo por billetes obligatorio: the store reports how many bills of each value (and the coins) it has; the counted
-- cash is their sum, the detail is kept in the closing (caja_cierres.conteo_billetes) and written at the start of its observations.
-- The previous public.cerrar_caja (a typed total) stops being accepted. Reversible: drop function public.cerrar_caja_billetes,
-- private.cerrar_caja_billetes; restore public.cerrar_caja as «select private.cerrar_caja(...)»; drop column conteo_billetes.

alter table public.caja_cierres add column if not exists conteo_billetes jsonb;

create or replace function private.cerrar_caja_billetes(p_sede uuid, p_fecha date, p_billetes jsonb, p_observaciones text) returns uuid
language plpgsql security definer set search_path='' as $$
declare den int[]:=array[100000,50000,20000,10000,5000,2000,1000]; d int; n numeric; total numeric:=0; monedas numeric; txt text:=''; nid uuid;
begin
 if jsonb_typeof(p_billetes)<>'object' then raise exception 'Escribe cuántos billetes hay de cada valor (pon 0 donde no haya).'; end if;
 foreach d in array den loop
  if not (p_billetes ? d::text) then raise exception 'Falta la cantidad de billetes de $%. Pon 0 si no hay.', to_char(d,'FM999G999'); end if;
  n:=(p_billetes->>d::text)::numeric;
  if n is null or n<0 or n<>trunc(n) or n>100000 then raise exception 'La cantidad de billetes de $% no es válida.', to_char(d,'FM999G999'); end if;
  total:=total+n*d;
  if n>0 then txt:=txt||case when txt='' then '' else ', ' end||n::int||' de $'||to_char(d,'FM999G999'); end if;
 end loop;
 monedas:=coalesce((p_billetes->>'monedas')::numeric,-1);
 if monedas<0 or monedas<>round(monedas) then raise exception 'Escribe el valor total de las monedas (0 si no hay).'; end if;
 total:=total+monedas;
 if monedas>0 then txt:=txt||case when txt='' then '' else ', ' end||'$'||to_char(monedas,'FM999G999G999')||' en monedas'; end if;
 nid:=private.cerrar_caja(p_sede,p_fecha,total,btrim('Conteo: '||coalesce(nullif(txt,''),'sin efectivo')||'. '||btrim(coalesce(p_observaciones,''))));
 if exists(select 1 from public.caja_cierres where id=nid and diferencia<>0) and length(btrim(coalesce(p_observaciones,'')))<5 then
  raise exception 'Hay diferencia entre lo contado y lo esperado: explica el motivo en observaciones.'; end if;
 update public.caja_cierres set conteo_billetes=p_billetes where id=nid;
 return nid;
end $$;

create or replace function public.cerrar_caja_billetes(p_sede uuid, p_fecha date, p_billetes jsonb, p_observaciones text) returns uuid
language sql set search_path='' as $$ select private.cerrar_caja_billetes(p_sede,p_fecha,p_billetes,p_observaciones); $$;
revoke all on function public.cerrar_caja_billetes(uuid,date,jsonb,text) from public, anon;
grant execute on function public.cerrar_caja_billetes(uuid,date,jsonb,text) to authenticated;

create or replace function public.cerrar_caja(p_sede uuid, p_fecha date, p_contado numeric, p_observaciones text) returns uuid
language plpgsql set search_path='' as $$
begin
 raise exception 'El cierre ahora pide el conteo por billetes. Recarga la página (Ctrl+F5) y vuelve a cerrar.';
end $$;
