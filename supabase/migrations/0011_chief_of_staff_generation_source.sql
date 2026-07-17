-- 0011_chief_of_staff_generation_source.sql
-- Slice 5.1: Unattended Daily Chief of Staff Briefings.
--
-- Purely additive: one new column, no changes to any existing column,
-- constraint, or policy. `generated_by` was already nullable
-- (`references profiles(id) on delete set null`, no NOT NULL) — no
-- migration was needed to allow a null generator. What's missing is a way
-- to record WHO/WHAT triggered generation distinctly from briefing_type,
-- since briefing_type only distinguishes daily/manual/fallback content,
-- not the invocation source. Cron-triggered generations set
-- generation_source = 'cron' and generated_by = null; every existing
-- (manual, browser-session) generation continues to set
-- generation_source = 'manual' and generated_by = the acting user's id.

alter table chief_of_staff_briefings
  add column generation_source text not null default 'manual'
  check (generation_source in ('manual', 'cron'));

comment on column chief_of_staff_briefings.generation_source is
  'Who/what triggered this generation: manual (browser-session owner/admin) or cron (unattended scheduled trigger, generated_by is null). Distinct from briefing_type, which describes content cadence, not invocation source.';
