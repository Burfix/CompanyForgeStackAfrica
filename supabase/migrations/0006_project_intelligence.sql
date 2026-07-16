-- 0006_project_intelligence.sql
-- Project Intelligence enhancement (Slice 2.5). Additive-only, following
-- the same pattern as 0005: no columns renamed or dropped, no existing
-- enum values removed. `category` is deliberately left as `text` — it is
-- constrained at the Zod/UI layer (see schemas/project.schema.ts), not by
-- a DB enum or check constraint, because existing rows were never audited
-- against a fixed value set and a destructive type conversion on a live
-- table without that audit is exactly the kind of change this project's
-- engineering rules prohibit. If a future pass confirms all existing
-- category values fit the curated set, a check constraint can be added
-- then without a rename.

-- ---------------------------------------------------------------------
-- New controlled-vocabulary enums
-- ---------------------------------------------------------------------

do $$ begin
  create type project_priority_level as enum ('urgent', 'high', 'medium', 'low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_review_cadence as enum ('weekly', 'biweekly', 'monthly', 'quarterly', 'milestone_based', 'none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_attention_mode as enum ('founder', 'delegated', 'team', 'no_attention');
exception when duplicate_object then null; end $$;

-- project_health already exists (on_track, at_risk, off_track). Extend it
-- additively with the fuller vocabulary the intelligence layer needs.
-- `on_track` remains a valid legacy value; new writes use `healthy`.
alter type project_health add value if not exists 'healthy';
alter type project_health add value if not exists 'needs_attention';
alter type project_health add value if not exists 'unknown';

do $$ begin
  create type project_dependency_type as enum ('blocks', 'depends_on', 'related_to');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- New project columns
-- ---------------------------------------------------------------------

alter table projects add column if not exists progress_percent integer not null default 0;
alter table projects add column if not exists health_note text;
alter table projects add column if not exists priority_level project_priority_level not null default 'medium';
alter table projects add column if not exists review_cadence project_review_cadence not null default 'none';
alter table projects add column if not exists attention_mode project_attention_mode not null default 'no_attention';
alter table projects add column if not exists business_impact text[] not null default '{}';

do $$ begin
  alter table projects add constraint chk_projects_progress_percent_range
    check (progress_percent >= 0 and progress_percent <= 100);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Indexes for the new intelligence dimensions
-- ---------------------------------------------------------------------

create index if not exists idx_projects_health on projects(organization_id, health);
create index if not exists idx_projects_priority_level on projects(organization_id, priority_level);
create index if not exists idx_projects_review_cadence on projects(organization_id, review_cadence);
create index if not exists idx_projects_attention_mode on projects(organization_id, attention_mode);
create index if not exists idx_projects_progress on projects(organization_id, progress_percent);
create index if not exists idx_projects_next_review on projects(organization_id, next_review_at);

-- ---------------------------------------------------------------------
-- project_dependencies — relational table, not JSON-embedded IDs
-- ---------------------------------------------------------------------

create table if not exists project_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  depends_on_project_id uuid not null references projects(id) on delete cascade,
  dependency_type project_dependency_type not null default 'depends_on',
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint chk_project_dependencies_no_self_reference check (project_id <> depends_on_project_id)
);

-- A given ordered pair may only be linked once, regardless of type — this
-- is the "duplicate relationships are prevented" rule from the spec.
create unique index if not exists idx_project_dependencies_unique_edge
  on project_dependencies(project_id, depends_on_project_id);

create index if not exists idx_project_dependencies_org on project_dependencies(organization_id);
create index if not exists idx_project_dependencies_depends_on on project_dependencies(organization_id, depends_on_project_id);

-- Defense-in-depth beyond the service-layer check: reject a dependency row
-- whose two projects don't both belong to the stated organization. The
-- service layer is still what produces the operator-safe error message —
-- this trigger exists so a cross-org edge can never land even if a future
-- code path forgets the app-layer check.
create or replace function private.enforce_project_dependency_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from projects
    where id = new.project_id and organization_id = new.organization_id
  ) then
    raise exception 'project_id does not belong to organization_id';
  end if;

  if not exists (
    select 1 from projects
    where id = new.depends_on_project_id and organization_id = new.organization_id
  ) then
    raise exception 'depends_on_project_id does not belong to organization_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_project_dependencies_same_org on project_dependencies;
create trigger trg_project_dependencies_same_org
  before insert or update on project_dependencies
  for each row execute function private.enforce_project_dependency_same_org();

revoke all on function private.enforce_project_dependency_same_org() from public, anon, authenticated;

alter table project_dependencies enable row level security;

create policy project_dependencies_select on project_dependencies for select
  using (private.is_org_member(organization_id));
create policy project_dependencies_write on project_dependencies for all
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
