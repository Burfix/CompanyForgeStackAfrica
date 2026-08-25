import { BriefcaseBusiness, CalendarClock, CircleDollarSign, Handshake, TrendingUp, TriangleAlert } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildRevenueWarRoomState, type DealStage, type WorkflowOwner } from '@/features/revenue-war-room/data';

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

export default async function RevenueWarRoomPage() {
  await requireUser();
  const state = buildRevenueWarRoomState();
  const forecastCoverage = Math.min(100, Math.round((state.projectedCash / state.targetAmount) * 100));

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
              <p className="mt-1 text-sm text-muted-foreground">Stale means no stage movement for 3+ days.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['Thami', 'Customer Development', 'EA', 'Cybersecurity'] as WorkflowOwner[]).map((owner) => (
                <OwnerBadge key={owner} owner={owner} />
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">Account</th>
                  <th className="py-3 pr-4 font-medium">Deal</th>
                  <th className="py-3 pr-4 font-medium">Stage</th>
                  <th className="py-3 pr-4 font-medium">Prob.</th>
                  <th className="py-3 pr-4 font-medium">Weighted</th>
                  <th className="py-3 pr-4 font-medium">Owner</th>
                  <th className="py-3 pr-4 font-medium">Next Action</th>
                  <th className="py-3 pr-4 font-medium">Action</th>
                  <th className="py-3 pr-4 font-medium">Close</th>
                  <th className="py-3 pr-4 font-medium">Payment</th>
                  <th className="py-3 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {state.deals.map((deal) => (
                  <tr key={deal.id} className="border-b border-border align-top last:border-0">
                    <td className="py-3 pr-4 font-medium text-foreground">{deal.account}</td>
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">{zar(deal.dealValue)}</td>
                    <td className="py-3 pr-4">
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', STAGE_TONE[deal.stage])}>{STAGE_LABEL[deal.stage]}</span>
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">{Math.round(deal.probability * 100)}%</td>
                    <td className="py-3 pr-4 font-medium tabular-nums text-foreground">{zar(deal.weightedValue)}</td>
                    <td className="py-3 pr-4"><OwnerBadge owner={deal.owner} /></td>
                    <td className="max-w-xs py-3 pr-4 text-muted-foreground">{deal.nextAction}</td>
                    <td className={cn('py-3 pr-4 tabular-nums', deal.overdue ? 'font-medium text-red-400' : 'text-muted-foreground')}>{dateLabel(deal.nextActionDate)}</td>
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">{dateLabel(deal.expectedCloseDate)}</td>
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">{dateLabel(deal.expectedPaymentDate)}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {deal.stale ? <span className="rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-xs font-medium text-red-300">Stale {deal.daysSinceMovement}d</span> : null}
                        {deal.blocker ? <span className="rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-300">Blocked</span> : null}
                        {!deal.needsAction ? <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-300">Moving</span> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
