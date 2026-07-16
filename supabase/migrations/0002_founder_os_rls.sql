-- 0002_founder_os_rls.sql
-- Row Level Security is the real authorization boundary for Founder OS.
-- Every tenant-scoped table is enabled with no permissive default: a table
-- with RLS on and no matching policy denies all access, which is the
-- correct fail-closed behavior.

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table organization_members enable row level security;
alter table invitations enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table milestones enable row level security;
alter table tasks enable row level security;
alter table activity_events enable row level security;

-- Helper: is the current user a member of this org?
-- SECURITY DEFINER avoids recursive RLS evaluation when this function is
-- used inside a policy on organization_members itself.
create or replace function is_org_member(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from organization_members
    where organization_id = target_org
      and user_id = auth.uid()
  );
$$;

-- Helper: does the current user hold at least `min_role` in this org?
-- Uses an explicit rank mapping rather than relying on Postgres enum
-- ordering, which is easy to get backwards and hard to audit at a glance.
create or replace function org_role_at_least(target_org uuid, min_role org_role)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and (case role
             when 'owner' then 4
             when 'admin' then 3
             when 'member' then 2
             when 'viewer' then 1
           end)
          >=
          (case min_role
             when 'owner' then 4
             when 'admin' then 3
             when 'member' then 2
             when 'viewer' then 1
           end)
  );
$$;

-- ORGANIZATIONS: members can read; only admin+ can update.
create policy org_select on organizations for select
  using (is_org_member(id));
create policy org_update on organizations for update
  using (org_role_at_least(id, 'admin'));

-- ORGANIZATION MEMBERS: members can see their org roster;
-- only admin+ can add/change/remove members.
create policy org_members_select on organization_members for select
  using (is_org_member(organization_id));
create policy org_members_write on organization_members for all
  using (org_role_at_least(organization_id, 'admin'))
  with check (org_role_at_least(organization_id, 'admin'));

-- INVITATIONS: only admin+ of the org can view or create invitations.
-- Accepting an invitation is handled server-side with the service role
-- client (the invitee has no org membership yet, so RLS would otherwise
-- block them from ever seeing their own invite).
create policy invitations_select on invitations for select
  using (org_role_at_least(organization_id, 'admin'));
create policy invitations_write on invitations for all
  using (org_role_at_least(organization_id, 'admin'))
  with check (org_role_at_least(organization_id, 'admin'));

-- PROFILES: readable by anyone sharing an org; writable only by self.
create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from organization_members m1
      join organization_members m2 on m1.organization_id = m2.organization_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );
create policy profiles_update_self on profiles for update
  using (id = auth.uid());

-- PROJECTS / MILESTONES / TASKS: standard org-scoped CRUD for any member.
-- Role-based write restrictions (e.g. viewer = read-only) are enforced at
-- the UI/service layer in Phase 1; promoting `viewer` to a hard DB-level
-- read-only policy is a follow-up once the role is actually assigned to
-- someone.
create policy projects_select on projects for select using (is_org_member(organization_id));
create policy projects_write on projects for all
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy project_members_select on project_members for select
  using (exists (select 1 from projects p where p.id = project_members.project_id and is_org_member(p.organization_id)));
create policy project_members_write on project_members for all
  using (exists (select 1 from projects p where p.id = project_members.project_id and is_org_member(p.organization_id)))
  with check (exists (select 1 from projects p where p.id = project_members.project_id and is_org_member(p.organization_id)));

create policy milestones_select on milestones for select using (is_org_member(organization_id));
create policy milestones_write on milestones for all
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy tasks_select on tasks for select using (is_org_member(organization_id));
create policy tasks_write on tasks for all
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

-- ACTIVITY EVENTS: readable by org members; insert-only, never updated or
-- deleted by clients — this is what keeps the audit trail tamper-evident.
create policy activity_select on activity_events for select using (is_org_member(organization_id));
create policy activity_insert on activity_events for insert
  with check (is_org_member(organization_id));
