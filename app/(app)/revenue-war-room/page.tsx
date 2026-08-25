import { BriefcaseBusiness, CalendarClock, CircleDollarSign, Handshake, TrendingUp, TriangleAlert } from 'lucide-react';
import { getCurrentOrg, requireUser } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildRevenueWarRoomState, type DealStage, type WorkflowOwner } from '@/features/revenue-war-room/data';
import { createRevenueDealAction, deleteRevenueDealAction, updateRevenueDealAction } from '@/features/revenue-war-room/actions';
import { DEAL_STAGE_VALUES, WORKFLOW_OWNER_VALUES } from '@/schemas/revenue-deal.schema';
import { revenueDealsRepository } from '@/repositories/revenue-deals.repository';

const STAGE_LABEL: Record<DealStage, string> = {
  lead: 'Lead',
  discovery: 'Discovery',
  demo: 'Demo',
  proposal: 'Proposal',
  procurement: 'Procurement',
  contracted: 'Contracted',
  closed: 'Closed',
};

const STAGE_TONE: Record<DealStage, string> = {
  lead: 'border-border bg-secondary text-secondary-foreground',
  discovery: 'border-sky-500/30 bg-sky-500/15 text-sky-300',
  demo: 'border-violet-500/30 bg-violet-500/15 text-violet-300',
  proposal: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
  procurement: 'border-orange-500/30 bg-orange-500/15 text-orange-300',
  contracted: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  closed: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
};

const OWNER_TONE: Record<WorkflowOwner, string> = {
  Thami: 'border-primary/40 bg-primary/15 text-primary',
  'Customer Development': 'border-sky-500/30 bg-sky-500/15 text-sky-300',
  EA: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  Cybersecurity: 'border-red-500/30 bg-red-500/15 text-red-300',
};

function zar(value: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(value);
}

function dateLabel(value: string): string {
  return new Date(`${value}T00:00:00+02:00`).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Johannesburg',
  });
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

function MetricCard({
  title,
  value,
  detail,
  tone = 'neutral',
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'positive' | 'danger';
  icon: typeof CircleDollarSign;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            'text-2xl font-semibold tabular-nums text-foreground',
            tone === 'positive' && 'text-emerald-400',
            tone === 'danger' && 'text-red-400',
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function OwnerBadge({ owner }: { owner: WorkflowOwner }) {
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', OWNER_TONE[owner])}>{owner}</span>;
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children ?? (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none ring-0 focus:border-primary"
        />
      )}
    </label>
  );
}

function StageSelect({ defaultValue }: { defaultValue: DealStage }) {
  return (
    <select name="stage" defaultValue={defaultValue} className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary">
      {DEAL_STAGE_VALUES.map((stage) => (
        <option key={stage} value={stage}>
          {STAGE_LABEL[stage]}
        </option>
      ))}
    </select>
  );
}

function OwnerSelect({ defaultValue }: { defaultValue: WorkflowOwner }) {
  return (
    <select name="owner" defaultValue={defaultValue} className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary">
      {WORKFLOW_OWNER_VALUES.map((owner) => (
        <option key={owner} value={owner}>
          {owner}
        </option>
      ))}
    </select>
  );
}

function DealFields({
  deal,
}: {
  deal: {
    account: string;
    dealValue: number;
    monthlyRecurringRevenue: number;
    stage: DealStage;
    probability: number;
    nextAction: string;
    owner: WorkflowOwner;
    nextActionDate: string;
    expectedCloseDate: string;
    expectedPaymentDate: string;
    lastMovedDate: string;
    blocker?: string;
  };
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Field label="Account" name="account" defaultValue={deal.account} />
      <Field label="Deal value" name="dealValue" type="number" defaultValue={deal.dealValue} />
      <Field label="MRR" name="monthlyRecurringRevenue" type="number" defaultValue={deal.monthlyRecurringRevenue} />
      <Field label="Probability %" name="probability" type="number" defaultValue={Math.round(deal.probability * 100)} />
      <Field label="Stage" name="stage">
        <StageSelect defaultValue={deal.stage} />
      </Field>
      <Field label="Owner" name="owner">
        <OwnerSelect defaultValue={deal.owner} />
      </Field>
      <Field label="Next action date" name="nextActionDate" type="date" defaultValue={deal.nextActionDate} />
      <Field label="Last moved" name="lastMovedDate" type="date" defaultValue={deal.lastMovedDate} />
      <Field label="Expected close" name="expectedCloseDate" type="date" defaultValue={deal.expectedCloseDate} />
      <Field label="Expected payment" name="expectedPaymentDate" type="date" defaultValue={deal.expectedPaymentDate} />
      <div className="md:col-span-2">
        <Field label="Blocker" name="blocker" defaultValue={deal.blocker ?? ''} />
      </div>
      <label className="flex flex-col gap-1 md:col-span-2 xl:col-span-4">
        <span className="text-xs text-muted-foreground">Next action</span>
        <textarea
          name="nextAction"
          defaultValue={deal.nextAction}
          rows={2}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
      </label>
    </div>
  );
}

export default async function RevenueWarRoomPage() {
  await requireUser();
  const org = await getCurrentOrg();
  const deals = await revenueDealsRepository.listByOrg(org.organizationId);
  const state = buildRevenueWarRoomState(deals);
  const forecastCoverage = Math.min(100, Math.round((state.projectedCash / state.targetAmount) * 100));
  const today = todayIso();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Founder operating system</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Revenue War Room</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.targetLabel}: {zar(state.targetAmount)} by {dateLabel(state.periodEndDate)}.
          </p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-300">Highest-value action</p>
          <p className="mt-1 max-w-2xl text-sm font-medium text-foreground">{state.todayActions[0]?.action ?? 'No revenue action is due today.'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Cash Collected / R30k" value={`${zar(state.cashCollected)} / ${zar(state.targetAmount)}`} detail={`${forecastCoverage}% projected coverage`} tone={state.gapToTarget === 0 ? 'positive' : 'danger'} icon={CircleDollarSign} />
        <MetricCard title="MRR Closed" value={zar(state.mrrClosed)} detail="Contracted recurring revenue" icon={Handshake} />
        <MetricCard title="Weighted Pipeline" value={zar(state.weightedPipeline)} detail="Probability-weighted September cash" tone="positive" icon={TrendingUp} />
        <MetricCard title="Days to 30 Sept" value={String(state.daysRemaining)} detail="Calendar days remaining" icon={CalendarClock} />
        <MetricCard title="Deals Needing Action" value={String(state.dealsNeedingAction)} detail="Due, stale, overdue or blocked" tone={state.dealsNeedingAction > 0 ? 'danger' : 'positive'} icon={TriangleAlert} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>September Cash Forecast</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Committed cash + probability-weighted pipeline = projected September cash.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Gap</p>
                <p className={cn('text-xl font-semibold tabular-nums', state.gapToTarget > 0 ? 'text-red-400' : 'text-emerald-400')}>{zar(state.gapToTarget)}</p>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={forecastCoverage}>
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${forecastCoverage}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['Collected', state.cashCollected],
                ['Contracted', state.contractedCash],
                ['Weighted', state.weightedPipeline],
                ['Projected', state.projectedCash],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-secondary/50 px-3 py-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{zar(Number(value))}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {state.todayActions.map((item, index) => (
              <div key={item.dealId} className="flex gap-3 rounded-lg border border-border bg-secondary/50 px-3 py-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.account}</p>
                    <OwnerBadge owner={item.owner} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.action}</p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    {item.reason} · {zar(item.weightedValue)} weighted
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Live Pipeline</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Edit a deal and save; the top-row figures recalculate from the stored pipeline.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['Thami', 'Customer Development', 'EA', 'Cybersecurity'] as WorkflowOwner[]).map((owner) => (
                <OwnerBadge key={owner} owner={owner} />
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.deals.map((deal) => (
            <div key={deal.id} className="rounded-lg border border-border bg-secondary/40 p-4">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{deal.account}</p>
                  <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', STAGE_TONE[deal.stage])}>{STAGE_LABEL[deal.stage]}</span>
                  <OwnerBadge owner={deal.owner} />
                  {deal.stale ? <span className="rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-xs font-medium text-red-300">Stale {deal.daysSinceMovement}d</span> : null}
                  {deal.blocker ? <span className="rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-300">Blocked</span> : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {zar(deal.dealValue)} · {Math.round(deal.probability * 100)}% · {zar(deal.weightedValue)} weighted
                </p>
              </div>
              <form action={updateRevenueDealAction.bind(null, deal.id)} className="flex flex-col gap-4">
                <DealFields deal={deal} />
                <div className="flex justify-end gap-2">
                  <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                    Save deal
                  </button>
                </div>
              </form>
              <form action={deleteRevenueDealAction.bind(null, deal.id)} className="mt-2 flex justify-end">
                <button type="submit" className="text-xs font-medium text-red-400 hover:text-red-300">
                  Delete deal
                </button>
              </form>
            </div>
          ))}
          <div className="rounded-lg border border-dashed border-border bg-background/40 p-4">
            <p className="mb-4 text-sm font-medium text-foreground">Add Deal</p>
            <form action={createRevenueDealAction} className="flex flex-col gap-4">
              <DealFields
                deal={{
                  account: '',
                  dealValue: 0,
                  monthlyRecurringRevenue: 0,
                  stage: 'lead',
                  probability: 0,
                  nextAction: '',
                  owner: 'Thami',
                  nextActionDate: today,
                  expectedCloseDate: '2026-09-30',
                  expectedPaymentDate: '2026-09-30',
                  lastMovedDate: today,
                  blocker: '',
                }}
              />
              <div className="flex justify-end">
                <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                  Add deal
                </button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle>Team Workflow</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            ['Customer Development', 'Feeds qualified opportunities into the pipeline and confirms decision makers.'],
            ['EA', 'Owns follow-ups, overdue actions and date hygiene.'],
            ['Cybersecurity', 'Clears enterprise assurance, trust and procurement blockers.'],
            ['Thami', 'Owns founder demos, negotiation and close.'],
          ].map(([owner, description]) => (
            <div key={owner} className="rounded-lg border border-border bg-secondary/50 px-3 py-3">
              <p className="text-sm font-medium text-foreground">{owner}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
