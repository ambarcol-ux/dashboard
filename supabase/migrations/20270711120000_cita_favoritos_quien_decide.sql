-- Seguimiento experto (fase 1): at the visit result the advisor records up to 3 dresses the customer tried (codes of her store)
-- and who decides; the automatic follow-up uses them (message with her favorite, message for whoever decides).
-- Reversión: drop function public.registrar_favoritos_cita(uuid,text[],text);
--   alter table public.primeras_citas drop column favoritos, drop column quien_decide;
alter table public.primeras_citas add column if not exists favoritos text[] not null default '{}',
 add column if not exists quien_decide text;

create or replace function public.registrar_favoritos_cita(p_id uuid, p_codigos text[], p_decide text)
returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; cods text[]; malos text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 if p_decide is not null and p_decide not in ('Ella','Mamá','Papá','Novio','Otra persona') then raise exception 'Elige quién decide.'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if c.id is null or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'No tienes acceso a esta visita.' using errcode='42501'; end if;
 select coalesce(array_agg(distinct upper(btrim(x))),'{}') into cods from unnest(coalesce(p_codigos,'{}')) x where btrim(x)<>'';
 if cardinality(cods)>3 then raise exception 'Máximo 3 vestidos favoritos.'; end if;
 select string_agg(x,', ') into malos from unnest(cods) x
  where not exists(select 1 from public.vestidos v where upper(btrim(v.codigo))=x and not coalesce(v.archivado,false) and (v.sede_actual_id=c.sede_id or v.sede_principal_id=c.sede_id));
 if malos is not null then raise exception 'No encontré en el inventario de esta sede: %', malos; end if;
 if cods=c.favoritos and p_decide is not distinct from c.quien_decide then return; end if;
 update public.primeras_citas set favoritos=cods, quien_decide=p_decide, updated_at=clock_timestamp() where id=p_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle)
  values(p_id,auth.uid(),'Favoritos y quién decide',coalesce(nullif(array_to_string(cods,', '),''),'sin favoritos')||' · decide: '||coalesce(p_decide,'sin dato'));
end $$;
revoke all on function public.registrar_favoritos_cita(uuid,text[],text) from public, anon;
grant execute on function public.registrar_favoritos_cita(uuid,text[],text) to authenticated;
