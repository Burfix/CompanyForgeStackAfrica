-- 0005_projects_slice2_schema.sql
-- Additive-only extension of `projects` for Slice 2. No columns renamed,
-- no types dropped — existing enum values are preserved, new ones added
-- alongside them via ALTER TYPE ... ADD VALUE. This was a deliberate
-- change from an earlier draft (enum swap + column renames) that got
-- blocked by an automated safety check on the grounds that it was a
-- destructive rewrite on a live project without explicit sign-off — the
-- additive approach below achieves the same functional outcome without
-- that risk. `target_outcome` and `due_date` are left in place, unused;
-- see docs/architecture.md for the note on dropping them once confirmed
-- safe.

alter type project_status add value if not exists 'proposed';
alter type project_status add value if not exists 'at_risk';
alter type project_status add value if not exists 'blocked';
alter type project_status add value if not exists 'parked';

alter table projects add column if not exists slug text;
alter table projects add column if not exists desired_outcome text;
alter table projects add column if not exists target_date date;
alter table projects add column if not exists success_metric text;
alter table projects add column if not exists target_value numeric(14, 2);
alter table projects add column if not exists current_value numeric(14, 2);
alter table projects add column if not exists start_date date;
alter table projects add column if not exists next_review_at timestamptz;
alter table projects add column if not exists blocked_reason text;
alter table projects add column if not exists waiting_on text;
alter table projects add column if not exists founder_attention_required boolean not null default false;

-- last_activity_at is distinct from updated_at: updated_at is a generic
-- mtime touched by the trigger on every row write; last_activity_at is a
-- deliberate, service-layer-set signal for "something founder-visible
-- happened" (status/focus/owner changes, not every field edit).
alter table projects add column if not exists last_activity_at timestamptz not null default now();

create unique index if not exists idx_projects_org_slug on projects(organization_id, slug) where slug is not null;
create index if not exists idx_projects_last_activity on projects(organization_id, last_activity_at desc);
create index if not exists idx_projects_attention on projects(organization_id, founder_attention_required) where founder_attention_required = true;
create index if not exists idx_projects_category on projects(organization_id, category);

alter table projects add constraint chk_projects_target_after_start
  check (start_date is null or target_date is null or target_date >= start_date);
