-- El acuerdo de vinculación se sube en Word (.docx): el bucket del módulo debe aceptarlo.
update storage.buckets set allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] where id='aliados_documentos';
