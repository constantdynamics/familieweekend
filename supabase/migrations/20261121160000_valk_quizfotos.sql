-- De Valkenburger Spelen 2027: meer foto's bij een quizvraag.
--
-- Een kaartvraag in GeoGuessr-stijl laat vaak meer dan één Street View-foto
-- van dezelfde plek zien. De eerste foto blijft in photo_upload_id staan
-- (zo blijft al het bestaande werken); de extra foto's komen in
-- extra_photo_ids, hoogstens vier.

alter table valk.quiz_questions
  add column extra_photo_ids uuid[] not null default '{}'::uuid[];

alter table valk.quiz_questions
  add constraint quiz_questions_extra_photos check (cardinality(extra_photo_ids) <= 4);

insert into valk.schema_migrations (version, name)
values ('20261121160000', 'valk_quizfotos')
on conflict (version) do nothing;
