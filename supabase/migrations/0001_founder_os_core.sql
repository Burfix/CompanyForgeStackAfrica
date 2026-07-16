-- 0001_founder_os_core.sql
-- Founder OS core schema: organizations, membership, projects, milestones,
-- tasks, activity log. See /docs/architecture.md for the full design.

create extension if not exists "pgcrypto";

-- ORGANIZATIONS -------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PROFILES (1:1 with auth.users) --------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ORG MEMBERSHIP --------------------------------------------------------
create type org_role as enum ('owner', 'admin', 'member', 'viewer');

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role org_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index idx_org_members_org on organization_members(organization_id);
create index idx_org_members_user on organization_members(user_id);

-- INVITATIONS ------------------------------------------------------------
-- Founder OS has no public sign-up. The only way into an org is an
-- invitation created by an admin/owner and accepted via a one-time token.
create table invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role org_role not null default 'member',
  token uuid not null default gen_random_uuid(),
  invited_by uuid references profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index idx_invitations_token on invitations(token);
create index idx_invitations_org on invitations(organization_id);

-- PROJECTS ---------------------------------------------------------------
create type project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');
create type project_health as enum ('on_track', 'at_risk', 'off_track');

create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  category text,
  owner_id uuid references profiles(id),
  status project_status not null default 'planning',
  focus_level smallint not null default 3 check (focus_level between 1 and 5),
  priority_score numeric(6, 2) not null default 0,
  target_outcome text,
  due_date date,
  health project_health not null default 'on_track',
  created_by uuid references profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_projects_org on projects(organization_id);
create index idx_projects_status on projects(organization_id, status);
create index idx_projects_focus on projects(organization_id, focus_level);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'contributor',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- MILESTONES ---------------------------------------------------------------
create type milestone_status as enum ('pending', 'in_progress', 'completed', 'missed');

create table milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status milestone_status not null default 'pending',
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_milestones_org on milestones(organization_id);
create index idx_milestones_project on milestones(project_id);
create index idx_milestones_due on milestones(organization_id, due_date);

-- TASKS ---------------------------------------------------------------
create type task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
create type task_priority as enum ('low', 'medium', 'high', 'urgent');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  notes text,
  status task_status not null default 'todo',
  priority task_priority not null default 'medium',
  assignee_id uuid references profiles(id),
  due_date date,
  completed_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tasks_org on tasks(organization_id);
create index idx_tasks_project on tasks(project_id);
create index idx_tasks_assignee on tasks(assignee_id);
create index idx_tasks_status on tasks(organization_id, status);
create index idx_tasks_due on tasks(organization_id, due_date);

-- ACTIVITY EVENTS ------------------------------------------------------
-- Append-only. Never updated or deleted by the application. This is the
-- audit trail today and the data feed for AI agents later.
create table activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references profiles(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  title text not null,
  description text,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_activity_org_time on activity_events(organization_id, occurred_at desc);
create index idx_activity_entity on activity_events(entity_type, entity_id);

-- updated_at triggers ----------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated_at before update on organizations
  for each row execute function set_updated_at();
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger trg_projects_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger trg_tasks_updated_at before update on tasks
  for each row execute function set_updated_at();
create trigger trg_milestones_updated_at before update on milestones
  for each row execute function set_updated_at();

-- Auto-create a profile row whenever a new auth user is created, so
-- application code never has to remember to do this manually.
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();
