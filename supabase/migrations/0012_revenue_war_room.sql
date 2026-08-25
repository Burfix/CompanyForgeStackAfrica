-- 0012_revenue_war_room.sql
-- Editable Revenue War Room pipeline for Founder OS.
--
-- Additive-only: creates an org-scoped revenue_deals table with the same
-- RLS boundary as Projects/Milestones/Tasks. The existing hardcoded pipeline
-- is seeded once per organization so the live War Room keeps its current
-- numbers while becoming editable through normal authenticated app flows.

create table if not exists revenue_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  account text not null,
  deal_value numeric(12, 2) not null default 0 check (deal_value >= 0),
  monthly_recurring_revenue numeric(12, 2) not null default 0 check (monthly_recurring_revenue >= 0),
  stage text not null default 'lead'
    check (stage in ('lead', 'discovery', 'demo', 'proposal', 'procurement', 'contracted', 'closed')),
  probability numeric(5, 4) not null default 0 check (probability >= 0 and probability <= 1),

  next_action text not null default '',
  owner text not null default 'Thami'
    check (owner in ('Thami', 'Customer Development', 'EA', 'Cybersecurity')),
  next_action_date date not null,
  expected_close_date date not null,
  expected_payment_date date not null,
  last_moved_date date not null default current_date,
  blocker text,

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table revenue_deals is
  'Organization-scoped editable pipeline powering Founder OS Revenue War Room forecasts and today actions.';

create index if not exists idx_revenue_deals_org_stage
  on revenue_deals (organization_id, stage);
create index if not exists idx_revenue_deals_org_next_action
  on revenue_deals (organization_id, next_action_date);
create index if not exists idx_revenue_deals_org_payment
  on revenue_deals (organization_id, expected_payment_date);

create unique index if not exists revenue_deals_org_account_unique
  on revenue_deals (organization_id, lower(account));

drop trigger if exists trg_revenue_deals_updated_at on revenue_deals;
create trigger trg_revenue_deals_updated_at
  before update on revenue_deals
  for each row execute function set_updated_at();

alter table revenue_deals enable row level security;

drop policy if exists revenue_deals_select on revenue_deals;
create policy revenue_deals_select on revenue_deals for select
  using (private.is_org_member(organization_id));

drop policy if exists revenue_deals_write on revenue_deals;
create policy revenue_deals_write on revenue_deals for all
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));

grant select, insert, update, delete on revenue_deals to authenticated;

insert into revenue_deals (
  organization_id,
  account,
  deal_value,
  monthly_recurring_revenue,
  stage,
  probability,
  next_action,
  owner,
  next_action_date,
  expected_close_date,
  expected_payment_date,
  last_moved_date,
  blocker
)
select
  o.id,
  seed.account,
  seed.deal_value,
  seed.monthly_recurring_revenue,
  seed.stage,
  seed.probability,
  seed.next_action,
  seed.owner,
  seed.next_action_date,
  seed.expected_close_date,
  seed.expected_payment_date,
  seed.last_moved_date,
  seed.blocker
from organizations o
cross join (
  values
    ('Tourvest Hospitality Group', 24000, 12000, 'procurement', 0.70, 'Send final assurance pack and ask for payment date confirmation.', 'Thami', '2026-08-24'::date, '2026-09-05'::date, '2026-09-10'::date, '2026-08-20'::date, 'Enterprise assurance sign-off'),
    ('Sea Castle Hotel Camps Bay', 9000, 4500, 'proposal', 0.55, 'Run owner demo focused on housekeeping, maintenance and compliance controls.', 'Thami', '2026-08-25'::date, '2026-09-12'::date, '2026-09-16'::date, '2026-08-22'::date, null),
    ('Primi Camps Bay', 7500, 3500, 'demo', 0.45, 'Book GM revenue recovery walkthrough and confirm decision maker.', 'Customer Development', '2026-08-24'::date, '2026-09-18'::date, '2026-09-20'::date, '2026-08-21'::date, null),
    ('Si Cantina Sociale', 6000, 3000, 'proposal', 0.50, 'Convert pilot ROI into two-line commercial offer for September.', 'EA', '2026-08-24'::date, '2026-09-15'::date, '2026-09-18'::date, '2026-08-19'::date, null),
    ('Airport Precinct Operator', 18000, 8000, 'discovery', 0.25, 'Qualify enterprise operations pain and identify procurement path.', 'Customer Development', '2026-08-26'::date, '2026-09-25'::date, '2026-09-30'::date, '2026-08-18'::date, 'Decision-maker access'),
    ('Shopping Centre Operations Pilot', 12000, 6000, 'lead', 0.20, 'Draft precinct command-center use case and request intro.', 'Cybersecurity', '2026-08-27'::date, '2026-09-28'::date, '2026-09-30'::date, '2026-08-20'::date, 'Enterprise assurance narrative')
) as seed(
  account,
  deal_value,
  monthly_recurring_revenue,
  stage,
  probability,
  next_action,
  owner,
  next_action_date,
  expected_close_date,
  expected_payment_date,
  last_moved_date,
  blocker
)
where not exists (
  select 1
  from revenue_deals existing
  where existing.organization_id = o.id
    and lower(existing.account) = lower(seed.account)
);
