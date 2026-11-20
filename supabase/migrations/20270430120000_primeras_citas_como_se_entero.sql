-- «¿Cómo nos conociste?»: the booking form offers more options (lib/first-visits.ts, COMO_NOS_CONOCISTE) than the check allowed,
-- so answers such as Facebook or TikTok were not saved. Widens the check to every option of the form.
-- Reversible: restore the check with ('Instagram','Recomendación','Pasaba por la tienda','Otro').
alter table public.primeras_citas drop constraint if exists primeras_citas_como_se_entero_check;
alter table public.primeras_citas add constraint primeras_citas_como_se_entero_check check (como_se_entero is null or como_se_entero in
 ('Instagram','Facebook','TikTok','WhatsApp','Google','Recomendación','Pasaba por la tienda','Un aliado (fotógrafo, maquilladora…)','Otro'));
