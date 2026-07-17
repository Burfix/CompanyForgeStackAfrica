-- 0010_chief_of_staff.sql
-- Slice 5: Chief of Staff — read-only interpretive layer on top of the
-- deterministic Projects/Milestones/Tasks/Activity operating system.
--
-- Purely additive: two new tables, no changes to any existing table,
-- enum, or column. Verified live counts before writing this (see Slice 5
-- audit): 1 organization, 1 member, 4 projects, 0 milestones, 0 tasks,
-- 4 activity_events — zero backfill risk, nothing to migrate.
--
-- This layer is READ-ONLY with respect to Projects/Milestones/Tasks: no
-- function or policy here grants the Chief of Staff any write access to
-- those tables, and the application-layer service intentionally never
-- imports the projects/tasks/milestones repositories' write methods (see
-- services/chief-of-staff.service.ts).

create table chief_of_staff_briefings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  briefing_date date not null,
  briefing_type text not null check (briefing_type in ('daily', 'manual', 'fallback')),
  status text not null check (status in ('generating', 'ready', 'fallback_ready', 'failed', 'superseded')),

  title text not null,
  executive_summary text,

  -- Structured, evidence-referencing arrays — see
  -- schemas/chief-of-staff.schema.ts for the shape validated before write.
  top_priorities jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  decisions_required jsonb not null default '[]'::jsonb,
  safe_to_ignore jsonb not null default '[]'::jsonb,
  changes_since_previous jsonb not null default '[]'::jsonb,
  observations jsonb not null default '[]'::jsonb,

  -- The exact evidence packet handed to the model (or used by the
  -- deterministic fallback) and the deterministic analysis it was built
  -- from — both stored so a briefing's reasoning is always reconstructable
  -- and so change-detection has a stable prior snapshot to diff against.
  evidence_snapshot jsonb not null default '{}'::jsonb,
  deterministic_snapshot jsonb not null default '{}'::jsonb,

  source_record_count integer not null default 0,
  source_latest_activity_at timestamptz,
  data_as_of timestamptz not null,

  model_provider text,
  model_name text,
  prompt_version text not null default 'v1',
  generation_duration_ms integer,
  generation_error_code text,
  generation_error_message text,

  generated_by uuid references profiles(id) on delete set null,
  generated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table chief_of_staff_briefings is
  'Immutable, org-scoped Chief of Staff briefings. Never written to by end users directly — only by services/chief-of-staff.service.ts. Never grants write access back to projects/milestones/tasks.';

-- One current (non-superseded) DAILY briefing per organisation per date.
-- Manual briefings are deliberately excluded from this constraint — the
-- spec calls for allowing multiple manual briefings on the same day.
create unique index chief_of_staff_briefings_one_current_daily
  on chief_of_staff_briefings (organization_id, briefing_date)
  where briefing_type = 'daily' and status <> 'superseded';

create index chief_of_staff_briefings_org_date_idx
  on chief_of_staff_briefings (organization_id, briefing_date desc);

create index chief_of_staff_briefings_org_status_idx
  on chief_of_staff_briefings (organization_id, status);

create trigger trg_chief_of_staff_briefings_updated_at
  before update on chief_of_staff_briefings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Feedback — deliberately minimal. Recorded for future product/prompt
-- iteration; never read back into generation in this slice (no
-- "automatically update AI prompts" behaviour exists anywhere in the
-- application layer).
-- ---------------------------------------------------------------------
create table chief_of_staff_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  briefing_id uuid not null references chief_of_staff_briefings(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rating text check (rating in ('positive', 'negative')),
  feedback_type text not null check (
    feedback_type in ('useful', 'inaccurate', 'missing_context', 'wrong_priority', 'too_verbose', 'too_vague')
  ),
  comment text,
  created_at timestamptz not null default now()
);

comment on table chief_of_staff_feedback is
  'Read-only-from-the-model feedback signal. Never mutates a briefing and is never fed back into generation automatically in this slice.';

create index chief_of_staff_feedback_briefing_idx on chief_of_staff_feedback (briefing_id);
create index chief_of_staff_feedback_org_idx on chief_of_staff_feedback (organization_id);

-- ---------------------------------------------------------------------
-- RLS — reuses the existing is_org_member / org_role_at_least helpers
-- from 0002_founder_os_rls.sql rather than inventing new authorization
-- logic. Fail-closed: RLS is enabled with no permissive default.
-- ---------------------------------------------------------------------
alter table chief_of_staff_briefings enable row level security;
alter table chief_of_staff_feedback enable row level security;

-- Any org member (including viewer) may READ briefings for their org.
create policy chief_of_staff_briefings_select on chief_of_staff_briefings for select
  using (private.is_org_member(organization_id));

-- Only owner/admin may create or update a briefing record. Briefings are
-- otherwise immutable from normal client forms — the only "update" path
-- in the application is the generation service transitioning
-- generating -> ready/fallback_ready/failed, or ready -> superseded,
-- which itself requires the same admin+ check server-side.
create policy chief_of_staff_briefings_write on chief_of_staff_briefings for all
  using (private.org_role_at_least(organization_id, 'admin'))
  with check (private.org_role_at_least(organization_id, 'admin'));

-- Feedback: any org member may submit feedback (no existing product rule
-- restricts feedback to admins), but a member may only ever see their own
-- feedback rows; admin+ may see the full organisation's feedback.
create policy chief_of_staff_feedback_select on chief_of_staff_feedback for select
  using (
    private.is_org_member(organization_id)
    and (user_id = auth.uid() or private.org_role_at_least(organization_id, 'admin'))
  );

create policy chief_of_staff_feedback_insert on chief_of_staff_feedback for insert
  with check (private.is_org_member(organization_id) and user_id = auth.uid());

-- Feedback is a one-way signal — no update/delete policy exists, so those
-- operations are denied by default (RLS fail-closed).
