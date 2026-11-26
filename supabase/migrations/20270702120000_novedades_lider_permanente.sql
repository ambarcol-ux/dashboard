-- Store leaders keep seeing the accounting alerts (Novedades contables) of their own store after 10/12/2026, when their
-- temporary accounting permissions end. Only the visibility is permanent; resolving powers keep their own rules.
-- Reversible: restore the previous condition in public.novedades_contables.
do $mig$
declare d text:=pg_get_functiondef('public.novedades_contables(uuid)'::regprocedure);
 a text:='if auth.uid() is null or not (todo or franq or private.lider_contable(null)) then return; end if;';
begin
 if position('asesora_lider' in d)>0 then return; end if;
 if position(a in d)=0 then raise exception 'novedades_contables: punto no encontrado'; end if;
 d:=replace(d,a,'if auth.uid() is null or not (todo or franq or private.lider_contable(null) or ''asesora_lider''=any(coalesce(private.roles_usuario(auth.uid()),''{}''))) then return; end if;');
 execute d;
end $mig$;
