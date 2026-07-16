-- 0007_tasks_execution_layer.sql
-- Slice 3: turn `tasks` into the operational execution layer beneath
-- Projects. Additive-only, same pattern as 0005/0006 — no columns
-- renamed or dropped, no existing enum values removed. The live `tasks`
-- table has zero rows (verified before writing this migration), so there
-- is nothing to backfill.
--
-- Column reuse decisions (adapting to the existing schema rather than
-- duplicating fields):
--   - `notes` is reused as the task description field (Zod: `description`).
--   - `assignee_id` is reused as the task owner field (Zod: `ownerId`),
--     the same UI-only "Executive Owner"-style rename pattern used for
--     projects.owner_id — the column itself is not renamed.
--   - `due_date` (date, no time) is left in place, unused going forward —
--     the new `due_at` (timestamptz) is the field the app writes and reads
--     from here on, mirroring how projects.due_date was superseded by
--     projects.target_date in 0005 without being dropped.
--   - `attention_mode` reuses the existing `project_attention_mode` enum
--     type rather than creating a duplicate enum with identical values —
--     the vocabulary (founder/delegated/team/no_attention) is genuinely
--     shared between Projects and Tasks.
--   - `project_id` is already NOT NULL on this table, which already
--     satisfies "require project_id for all manually created tasks" for
--     v1 — no schema change needed there.

-- ---------------------------------------------------------------------
-- task_status: additive extension
-- ---------------------------------------------------------------------
-- Existing values: todo, in_progress, blocked, done, cancelled.
-- New curated app-level vocabulary adds inbox/planned/waiting/review/
-- completed. `todo` and `done` remain valid legacy values (nothing new
-- writes them) — same superset-enum pattern as project_status/project_health.

alter type task_status add value if not exists 'inbox';
alter type task_status add value if not exists 'planned';
alter type task_status add value if not exists 'waiting';
alter type task_status add value if not exists 'review';
alter type task_status add value if not exists 'completed';

-- ---------------------------------------------------------------------
-- New task columns
-- ---------------------------------------------------------------------

alter table tasks add column if not exists milestone_id uuid references milestones(id) on delete set null;
alter table tasks add column if not exists attention_mode project_attention_mode not null default 'no_attention';
alter table tasks add column if not exists founder_required boolean not null default false;
alter table tasks add column if not exists due_at timestamptz;
alter table tasks add column if not exists start_at timestamptz;
alter table tasks add column if not exists estimated_minutes integer;
alter table tasks add column if not exists actual_minutes integer;
alter table tasks add column if not exists blocked_reason text;
alter table tasks add column if not exists waiting_on text;
alter table tasks add column if not exists next_action text;
alter table tasks add column if not exists source_type text not null default 'manual';
alter table tasks add column if not exists source_reference text;
alter table tasks add column if not exists last_activity_at timestamptz not null default now();

do $$ begin
  alter table tasks add constraint chk_tasks_estimated_minutes_positive
    check (estimated_minutes is null or estimated_minutes > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tasks add constraint chk_tasks_actual_minutes_nonnegative
    check (actual_minutes is null or actual_minutes >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tasks add constraint chk_tasks_due_after_start
    check (due_at is null or start_at is null or due_at >= start_at);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Indexes — single-column for the recommended filter dimensions, plus
-- the three composites that match the Tasks page's actual query shapes
-- (status+due_at for the work-queue default view, owner+status for "My
-- Focus", project+status for the project detail Tasks section). Not
-- adding more composites than those three real query shapes justify.
-- ---------------------------------------------------------------------

create index if not exists idx_tasks_organization on tasks(organization_id);
create index if not exists idx_tasks_project on tasks(organization_id, project_id);
create index if not exists idx_tasks_owner on tasks(organization_id, assignee_id);
create index if not exists idx_tasks_status on tasks(organization_id, status);
create index if not exists idx_tasks_priority on tasks(organization_id, priority);
create index if not exists idx_tasks_due_at on tasks(organization_id, due_at);
create index if not exists idx_tasks_completed_at on tasks(organization_id, completed_at);
create index if not exists idx_tasks_founder_required on tasks(organization_id, founder_required) where founder_required = true;
create index if not exists idx_tasks_attention_mode on tasks(organization_id, attention_mode);
create index if not exists idx_tasks_last_activity on tasks(organization_id, last_activity_at desc);
create index if not exists idx_tasks_milestone on tasks(milestone_id) where milestone_id is not null;

create index if not exists idx_tasks_org_status_due on tasks(organization_id, status, due_at);
create index if not exists idx_tasks_org_owner_status on tasks(organization_id, assignee_id, status);
create index if not exists idx_tasks_org_project_status on tasks(organization_id, project_id, status);

-- RLS: tasks already has RLS enabled with org-scoped policies from 0002
-- (tasks_select / tasks_write using is_org_member) — nothing to add here.
