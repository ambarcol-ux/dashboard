-- Ámbar Exitoso · Etapa 3: Academia Ámbar (Manuales › Manual Ámbar). Each protocol ends with a short evaluation; 80 % or more passes it.
-- Passing all of them certifies the person («Certificada Ámbar»). Administration sees the progress of the whole team by store.
-- History: private.config_historial(). Reversible: drop table public.academia_resultados; drop the functions created here.

create table if not exists public.academia_resultados(
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null references public.profiles(id),
 protocolo text not null,
 correctas integer not null,
 total integer not null check (total>0),
 resultado numeric(5,1) not null,
 aprobado boolean not null,
 respuestas jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists academia_resultados_usuario on public.academia_resultados(usuario_id, protocolo, created_at desc);
alter table public.academia_resultados enable row level security;
create policy academia_resultados_ver on public.academia_resultados for select to authenticated using (usuario_id=auth.uid() or public.es_admin() or private.es_finanzas());
create trigger academia_resultados_historial after insert or update or delete on public.academia_resultados for each row execute function private.config_historial();

-- Saves one attempt of the signed-in person. p_respuestas: {question_id: chosen option index}.
create or replace function public.academia_guardar(p_protocolo text, p_correctas integer, p_total integer, p_respuestas jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r numeric; ok boolean;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if coalesce(p_total,0)<=0 or p_correctas<0 or p_correctas>p_total or btrim(coalesce(p_protocolo,''))='' then raise exception 'Evaluación no válida.'; end if;
 r:=round(100.0*p_correctas/p_total,1); ok:=r>=80;
 insert into public.academia_resultados(usuario_id,protocolo,correctas,total,resultado,aprobado,respuestas) values(auth.uid(),p_protocolo,p_correctas,p_total,r,ok,coalesce(p_respuestas,'{}'::jsonb));
 return jsonb_build_object('resultado',r,'aprobado',ok);
end $$;

-- Progress: best result per person and protocol. Administration/accounting see everyone active; the rest, only themselves.
create or replace function public.academia_avance() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'nombre',coalesce(nullif(btrim(u.nombre),''),u.email),'rol',u.rol,'sede',s.nombre,
  'protocolos',coalesce((select jsonb_object_agg(b.protocolo,jsonb_build_object('mejor',b.mejor,'aprobado',b.aprobado,'intentos',b.intentos,'fecha',b.fecha))
   from (select a.protocolo,max(a.resultado) mejor,bool_or(a.aprobado) aprobado,count(*) intentos,max(a.created_at) fecha from public.academia_resultados a where a.usuario_id=u.id group by a.protocolo) b),'{}'::jsonb))
  order by s.nombre nulls last,u.nombre),'[]'::jsonb)
 from public.profiles u left join public.sedes s on s.id=u.sede_id
 where coalesce(u.activo,true) and (u.id=auth.uid() or public.es_admin() or private.es_finanzas());
$$;
revoke all on function public.academia_guardar(text,integer,integer,jsonb), public.academia_avance() from public, anon;
grant execute on function public.academia_guardar(text,integer,integer,jsonb), public.academia_avance() to authenticated;
