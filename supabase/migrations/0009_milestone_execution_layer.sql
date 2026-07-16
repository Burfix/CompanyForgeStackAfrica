-- 0009_milestone_execution_layer.sql
-- Slice 4: complete the milestone model and connect Projects, Milestones
-- and Tasks into one execution system. Additive-only, same discipline as
-- 0005/0006/0007: no columns renamed or dropped, no existing enum values
-- removed. Verified live counts before writing this migration:
--   milestones: 0 rows, tasks: 0 rows, projects: 4 rows.
-- Both milestones and tasks are empty in production, so there is no
-- backfill risk at all for the new NOT NULL columns below — their
-- defaults apply to zero existing rows.
--
-- Column/enum reuse decisions:
--   - milestone priority reuses `project_priority_level` (urgent/high/
--     medium/low) — identical vocabulary to Projects and Tasks, no reason
--     to duplicate it a third time.
--   - milestone attention_mode reuses `project_attention_mode` (founder/
--     delegated/team/no_attention) — same shared vocabulary Tasks already
--     reuses in 0007.
--   - milestone health gets its OWN dedicated enum (`milestone_health`)
--     rather than reusing `project_health`, per the spec: reusing it would
--     couple milestone rows to a type that's conceptually a project-level
--     concept and may evolve independently (e.g. legacy `on_track` is a
--     project-only artifact that has no reason to exist on milestones).
--   - `due_date` (date) remains the canonical milestone deadline. Unlike
--     Tasks, milestones only need day-level deadlines — the spec is
--     explicit not to mechanically repeat the due_date/due_at split just
--     because Tasks has one. No `due_at` column is added. `start_at` is
--     likewise added as `start_date` (date), matching due_date's grain
--     rather than introducing timestamptz where no time-of-day input
--     exists in the UI.
--   - `next_review_at` is timestamptz, matching projects.next_review_at's
--     existing type exactly (both represent the same kind of "next
--     checkpoint" concept).
--   - `target_value`/`current_value` are `text` from the start — Slice 2.5
--     had to walk these back from numeric on Projects (see 0008); no
--     reason to repeat that mistake here.

-- ---------------------------------------------------------------------
-- milestone_status: additive extension
-- ---------------------------------------------------------------------
-- Existing values: pending, in_progress, completed, missed. Adding the
-- three the spec calls out as clear execution needs. Nothing removed.

alter type milestone_status add value if not exists 'blocked';
alter type milestone_status add value if not exists 'waiting';
alter type milestone_status add value if not exists 'cancelled';

-- ---------------------------------------------------------------------
-- New controlled-vocabulary enums
-- ---------------------------------------------------------------------

do $$ begin
  create type milestone_health as enum ('healthy', 'needs_attention', 'at_risk', 'off_track', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type milestone_progress_mode as enum ('automatic', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_progress_mode as enum ('manual', 'milestones');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- New milestone columns
-- ---------------------------------------------------------------------

alter table milestones add column if not exists health milestone_health not null default 'unknown';
alter table milestones add column if not exists health_note text;
alter table milestones add column if not exists progress_percent integer not null default 0;
alter table milestones add column if not exists progress_mode milestone_progress_mode not null default 'automatic';
alter table milestones add column if not exists priority project_priority_level not null default 'medium';
alter table milestones add column if not exists owner_id uuid references profiles(id);
alter table milestones add column if not exists attention_mode project_attention_mode not null default 'no_attention';
alter table milestones add column if not exists founder_required boolean not null default false;
alter table milestones add column if not exists start_date date;
alter table milestones add column if not exists next_review_at timestamptz;
alter table milestones add column if not exists success_criteria text;
alter table milestones add column if not exists target_value text;
alter table milestones add column if not exists current_value text;
alter table milestones add column if not exists blocked_reason text;
alter table milestones add column if not exists waiting_on text;
alter table milestones add column if not exists last_activity_at timestamptz not null default now();
alter table milestones add column if not exists created_by uuid references profiles(id);

do $$ begin
  alter table milestones add constraint chk_milestones_progress_percent_range
    check (progress_percent >= 0 and progress_percent <= 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table milestones add constraint chk_milestones_due_after_start
    check (start_date is null or due_date is null or due_date >= start_date);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- New project column: progress roll-up mode
-- ---------------------------------------------------------------------
-- Every existing project (4 rows, verified above) defaults safely to
-- 'manual' — behaviour is identical to today until an operator explicitly
-- switches a project to milestone-derived progress.

alter table projects add column if not exists progress_mode project_progress_mode not null default 'manual';

-- ---------------------------------------------------------------------
-- Indexes — organisation-scoped, matching the recommended filter
-- dimensions. idx_milestones_org, idx_milestones_project and
-- idx_milestones_due already exist from 0001; not duplicated here.
-- ---------------------------------------------------------------------

create index if not exists idx_milestones_status on milestones(organization_id, status);
create index if not exists idx_milestones_health on milestones(organization_id, health);
create index if not exists idx_milestones_priority on milestones(organization_id, priority);
create index if not exists idx_milestones_owner on milestones(organization_id, owner_id);
create index if not exists idx_milestones_next_review on milestones(organization_id, next_review_at);
create index if not exists idx_milestones_attention_mode on milestones(organization_id, attention_mode);
create index if not exists idx_milestones_last_activity on milestones(organization_id, last_activity_at desc);
create index if not exists idx_milestones_founder_required on milestones(organization_id, founder_required) where founder_required = true;

create index if not exists idx_projects_progress_mode on projects(organization_id, progress_mode);

-- RLS: milestones already has RLS enabled with org-scoped policies from
-- 0002 (same is_org_member pattern as projects/tasks) — nothing to add
-- here. Every new column is covered by the existing row-level policy
-- since RLS operates on organization_id, not per-column.
