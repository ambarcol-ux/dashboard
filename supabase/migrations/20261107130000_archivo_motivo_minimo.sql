-- Archivar un vestido exige un motivo explicado (mínimo 30 caracteres).
do $do$ declare d text:=pg_get_functiondef('private.archivar_vestido'::regproc); begin
 if position('not between 5 and 500' in d)>0 then
  d:=replace(d,'length(reason) not between 5 and 500','length(reason) not between 30 and 500');
  d:=replace(d,'(mínimo 5 caracteres)','explicando por qué (mínimo 30 caracteres)');
  execute d;
 end if;
end $do$;
