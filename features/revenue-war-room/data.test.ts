import { describe, expect, it } from 'vitest';
import { DEFAULT_REVENUE_PIPELINE, buildRevenueWarRoomState } from './data';

describe('Revenue War Room state', () => {
  const state = buildRevenueWarRoomState(DEFAULT_REVENUE_PIPELINE, new Date('2026-08-24T08:00:00+02:00'));

  it('starts empty when no real pipeline data exists', () => {
    const emptyState = buildRevenueWarRoomState([], new Date('2026-08-24T08:00:00+02:00'));

    expect(emptyState.cashCollected).toBe(0);
    expect(emptyState.weightedPipeline).toBe(0);
    expect(emptyState.projectedCash).toBe(0);
    expect(emptyState.dealsNeedingAction).toBe(0);
    expect(emptyState.todayActions).toEqual([]);
  });

  it('forecasts September cash against the R30k target', () => {
    expect(state.targetAmount).toBe(30_000);
    expect(state.daysRemaining).toBe(37);
    expect(state.cashCollected).toBe(0);
    expect(state.contractedCash).toBe(0);
    expect(state.weightedPipeline).toBe(35_025);
    expect(state.projectedCash).toBe(35_025);
    expect(state.gapToTarget).toBe(0);
  });

  it('flags deals that are due, stale, overdue, or blocked', () => {
    expect(state.dealsNeedingAction).toBe(5);

    const tourvest = state.deals.find((deal) => deal.id === 'tourvest-assurance-close');
    expect(tourvest?.needsAction).toBe(true);
    expect(tourvest?.stale).toBe(true);
    expect(tourvest?.blocker).toBe('Enterprise assurance sign-off');

    const seaCastle = state.deals.find((deal) => deal.id === 'sea-castle-upgrade');
    expect(seaCastle?.needsAction).toBe(false);
  });

  it('prioritizes the highest-value founder action first', () => {
    expect(state.todayActions).toHaveLength(5);
    expect(state.todayActions[0]).toMatchObject({
      account: 'Tourvest Hospitality Group',
      owner: 'Thami',
      priority: 'critical',
      weightedValue: 16_800,
    });
  });

  it('derives collected and contracted cash from editable deal stages', () => {
    const stateWithClosedDeal = buildRevenueWarRoomState(
      DEFAULT_REVENUE_PIPELINE.map((deal) =>
        deal.id === 'tourvest-assurance-close'
          ? { ...deal, stage: 'closed' }
          : deal.id === 'sea-castle-upgrade'
            ? { ...deal, stage: 'contracted' }
            : deal,
      ),
      new Date('2026-08-24T08:00:00+02:00'),
    );

    expect(stateWithClosedDeal.cashCollected).toBe(24_000);
    expect(stateWithClosedDeal.contractedCash).toBe(9_000);
    expect(stateWithClosedDeal.weightedPipeline).toBe(13_275);
  });

  it('uses Johannesburg date boundaries instead of UTC around midnight', () => {
    const afterMidnightSast = buildRevenueWarRoomState(DEFAULT_REVENUE_PIPELINE, new Date('2026-08-25T22:21:00.000Z'));

    expect(afterMidnightSast.daysRemaining).toBe(35);
    expect(afterMidnightSast.deals.find((deal) => deal.id === 'airport-precinct-pilot')?.daysUntilNextAction).toBe(0);
  });
});
