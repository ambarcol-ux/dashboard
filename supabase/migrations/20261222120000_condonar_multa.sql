-- Multas: administración puede condonar (perdonar) toda o parte de la multa pendiente de un contrato, con motivo y registro en la bitácora.
-- Reversión: drop function public.condonar_multa(uuid,numeric,text); drop function private.condonar_multa(uuid,numeric,text);
create or replace function private.condonar_multa(p_contrato uuid, p_valor numeric, p_motivo text)
 returns numeric language plpgsql security definer set search_path to ''
as $function$
declare c record; pendiente numeric; quien text;
begin
 if not public.es_admin() then raise exception 'Solo administración puede condonar multas.' using errcode='42501'; end if;
 select id,numero_contrato,valor_total,total_arreglos,anticipo,coalesce(total_multas,0) multas into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 pendiente:=least(c.multas,greatest(0,public.saldo_contrato(c.valor_total,c.total_arreglos,c.anticipo)+c.multas));
 if pendiente<=0 then raise exception 'Este contrato no tiene multas pendientes.'; end if;
 if p_valor is null or p_valor<=0 or p_valor>pendiente then raise exception 'El valor a condonar debe estar entre $1 y la multa pendiente ($%).',replace(to_char(pendiente,'FM999G999G999'),',','.'); end if;
 if length(btrim(coalesce(p_motivo,'')))<10 then raise exception 'Escribe el motivo de la condonación (mínimo 10 caracteres).'; end if;
 update public.contratos set total_multas=c.multas-p_valor where id=p_contrato;
 select coalesce(nombre,email) into quien from public.profiles where id=auth.uid();
 insert into public.bitacora_contratos(contrato_id,usuario_email,accion,detalle,fecha,usuario)
 values(p_contrato,(select email from public.profiles where id=auth.uid()),'Multa condonada',
  'Se condonaron $'||replace(to_char(p_valor,'FM999G999G999'),',','.')||' de multa (pendiente antes: $'||replace(to_char(pendiente,'FM999G999G999'),',','.')||'). Motivo: '||btrim(p_motivo),now(),coalesce(quien,'Administración'));
 return pendiente-p_valor;
end $function$;
create or replace function public.condonar_multa(p_contrato uuid, p_valor numeric, p_motivo text)
 returns numeric language sql set search_path to ''
as $function$ select private.condonar_multa(p_contrato,p_valor,p_motivo); $function$;
revoke all on function private.condonar_multa(uuid,numeric,text) from public, anon;
grant execute on function private.condonar_multa(uuid,numeric,text) to authenticated;
revoke all on function public.condonar_multa(uuid,numeric,text) from public, anon;
grant execute on function public.condonar_multa(uuid,numeric,text) to authenticated;
