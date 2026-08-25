import type { DealStage, WorkflowOwner } from '@/schemas/revenue-deal.schema';

export type { DealStage, WorkflowOwner };

export interface RevenueDeal {
  id: string;
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
}

export interface RevenueDealView extends RevenueDeal {
  weightedValue: number;
  daysUntilNextAction: number;
  daysSinceMovement: number;
  needsAction: boolean;
  stale: boolean;
  overdue: boolean;
}

export interface TodayRevenueAction {
  dealId: string;
  account: string;
  owner: WorkflowOwner;
  action: string;
  dealValue: number;
  weightedValue: number;
  priority: 'critical' | 'high' | 'medium';
  reason: string;
}

export interface RevenueWarRoomState {
  targetLabel: string;
  targetAmount: number;
  periodEndDate: string;
  cashCollected: number;
  contractedCash: number;
  mrrClosed: number;
  weightedPipeline: number;
  projectedCash: number;
  gapToTarget: number;
  daysRemaining: number;
  dealsNeedingAction: number;
  todayActions: TodayRevenueAction[];
  deals: RevenueDealView[];
}

const TARGET_AMOUNT = 30_000;
const PERIOD_END_DATE = '2026-09-30';
const WAR_ROOM_TIME_ZONE = 'Africa/Johannesburg';

export const DEFAULT_REVENUE_PIPELINE: RevenueDeal[] = [
  {
    id: 'tourvest-assurance-close',
    account: 'Tourvest Hospitality Group',
    dealValue: 24_000,
    monthlyRecurringRevenue: 12_000,
    stage: 'procurement',
    probability: 0.7,
    nextAction: 'Send final assurance pack and ask for payment date confirmation.',
    owner: 'Thami',
    nextActionDate: '2026-08-24',
    expectedCloseDate: '2026-09-05',
    expectedPaymentDate: '2026-09-10',
    lastMovedDate: '2026-08-20',
    blocker: 'Enterprise assurance sign-off',
  },
  {
    id: 'sea-castle-upgrade',
    account: 'Sea Castle Hotel Camps Bay',
    dealValue: 9_000,
    monthlyRecurringRevenue: 4_500,
    stage: 'proposal',
    probability: 0.55,
    nextAction: 'Run owner demo focused on housekeeping, maintenance and compliance controls.',
    owner: 'Thami',
    nextActionDate: '2026-08-25',
    expectedCloseDate: '2026-09-12',
    expectedPaymentDate: '2026-09-16',
    lastMovedDate: '2026-08-22',
  },
  {
    id: 'primi-camps-bay-expansion',
    account: 'Primi Camps Bay',
    dealValue: 7_500,
    monthlyRecurringRevenue: 3_500,
    stage: 'demo',
    probability: 0.45,
    nextAction: 'Book GM revenue recovery walkthrough and confirm decision maker.',
    owner: 'Customer Development',
    nextActionDate: '2026-08-24',
    expectedCloseDate: '2026-09-18',
    expectedPaymentDate: '2026-09-20',
    lastMovedDate: '2026-08-21',
  },
  {
    id: 'si-cantina-retainer',
    account: 'Si Cantina Sociale',
    dealValue: 6_000,
    monthlyRecurringRevenue: 3_000,
    stage: 'proposal',
    probability: 0.5,
    nextAction: 'Convert pilot ROI into two-line commercial offer for September.',
    owner: 'EA',
    nextActionDate: '2026-08-24',
    expectedCloseDate: '2026-09-15',
    expectedPaymentDate: '2026-09-18',
    lastMovedDate: '2026-08-19',
  },
  {
    id: 'airport-precinct-pilot',
    account: 'Airport Precinct Operator',
    dealValue: 18_000,
    monthlyRecurringRevenue: 8_000,
    stage: 'discovery',
    probability: 0.25,
    nextAction: 'Qualify enterprise operations pain and identify procurement path.',
    owner: 'Customer Development',
    nextActionDate: '2026-08-26',
    expectedCloseDate: '2026-09-25',
    expectedPaymentDate: '2026-09-30',
    lastMovedDate: '2026-08-18',
    blocker: 'Decision-maker access',
  },
  {
    id: 'shopping-centre-ops-pilot',
    account: 'Shopping Centre Operations Pilot',
    dealValue: 12_000,
    monthlyRecurringRevenue: 6_000,
    stage: 'lead',
    probability: 0.2,
    nextAction: 'Draft precinct command-center use case and request intro.',
    owner: 'Cybersecurity',
    nextActionDate: '2026-08-27',
    expectedCloseDate: '2026-09-28',
    expectedPaymentDate: '2026-09-30',
    lastMovedDate: '2026-08-20',
    blocker: 'Enterprise assurance narrative',
  },
];

function asSastDate(value: string): Date {
  return new Date(`${value}T00:00:00+02:00`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

function todayInWarRoomTimezone(today: Date): string {
  return today.toLocaleDateString('en-CA', { timeZone: WAR_ROOM_TIME_ZONE });
}

export function buildRevenueWarRoomState(dealsInput: RevenueDeal[] = DEFAULT_REVENUE_PIPELINE, today = new Date()): RevenueWarRoomState {
  const normalizedToday = asSastDate(todayInWarRoomTimezone(today));
  const periodEnd = asSastDate(PERIOD_END_DATE);

  const deals = dealsInput.map((deal) => {
    const daysUntilNextAction = daysBetween(normalizedToday, asSastDate(deal.nextActionDate));
    const daysSinceMovement = Math.max(0, daysBetween(asSastDate(deal.lastMovedDate), normalizedToday));
    const weightedValue = Math.round(deal.dealValue * deal.probability);
    const overdue = daysUntilNextAction < 0;
    const stale = daysSinceMovement >= 3;
    const needsAction = overdue || daysUntilNextAction <= 0 || stale || Boolean(deal.blocker);

    return {
      ...deal,
      weightedValue,
      daysUntilNextAction,
      daysSinceMovement,
      needsAction,
      stale,
      overdue,
    };
  });

  const cashCollected = deals
    .filter((deal) => deal.stage === 'closed')
    .reduce((sum, deal) => sum + deal.dealValue, 0);
  const contractedCash = deals
    .filter((deal) => deal.stage === 'contracted')
    .reduce((sum, deal) => sum + deal.dealValue, 0);
  const mrrClosed = deals
    .filter((deal) => deal.stage === 'contracted' || deal.stage === 'closed')
    .reduce((sum, deal) => sum + deal.monthlyRecurringRevenue, 0);
  const weightedPipeline = deals
    .filter((deal) => deal.stage !== 'closed' && deal.stage !== 'contracted')
    .reduce((sum, deal) => sum + deal.weightedValue, 0);
  const projectedCash = cashCollected + contractedCash + weightedPipeline;

  return {
    targetLabel: 'September target',
    targetAmount: TARGET_AMOUNT,
    periodEndDate: PERIOD_END_DATE,
    cashCollected,
    contractedCash,
    mrrClosed,
    weightedPipeline,
    projectedCash,
    gapToTarget: Math.max(0, TARGET_AMOUNT - projectedCash),
    daysRemaining: Math.max(0, daysBetween(normalizedToday, periodEnd)),
    dealsNeedingAction: deals.filter((deal) => deal.needsAction).length,
    todayActions: buildTodayActions(deals),
    deals: deals.sort((a, b) => b.weightedValue - a.weightedValue),
  };
}

function buildTodayActions(deals: RevenueDealView[]): TodayRevenueAction[] {
  return deals
    .filter((deal) => deal.needsAction)
    .sort((a, b) => {
      const urgencyDelta =
        Number(b.overdue) - Number(a.overdue) ||
        Number(b.owner === 'Thami') - Number(a.owner === 'Thami') ||
        Number(b.stale) - Number(a.stale);

      if (urgencyDelta !== 0) return urgencyDelta;
      return b.weightedValue - a.weightedValue;
    })
    .slice(0, 5)
    .map((deal) => ({
      dealId: deal.id,
      account: deal.account,
      owner: deal.owner,
      action: deal.nextAction,
      dealValue: deal.dealValue,
      weightedValue: deal.weightedValue,
      priority: deal.overdue || deal.blocker ? 'critical' : deal.stale ? 'high' : 'medium',
      reason: deal.blocker
        ? `Blocker: ${deal.blocker}`
        : deal.overdue
          ? 'Next action is overdue'
          : deal.stale
            ? `No movement for ${deal.daysSinceMovement} days`
            : 'Due today',
    }));
}
