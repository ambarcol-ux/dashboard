-- «¿Cómo se enteró?» (walk-in visits) gets the option «Google / Google Maps» to measure visits from Google. Revert: remove that row.
insert into public.listas_contrato(lista,valor,orden) values('pv_como_se_entero','Google / Google Maps',2) on conflict do nothing;
