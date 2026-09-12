-- Run with the Supabase SQL editor / postgres role on ambar-erp.
-- Preserve all other Auth claims and resolve the account by its verified email.
-- Existing authenticated RLS policies already allow updating operational records.
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || '{"can_edit_saved_records": true}'::jsonb,
    updated_at = now()
WHERE lower(email) = 'rubenvaron239@gmail.com';

SELECT u.email, p.rol, p.activo,
       u.raw_app_meta_data ->> 'can_edit_saved_records' AS can_edit_saved_records
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = 'rubenvaron239@gmail.com';
