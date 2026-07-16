import { describe, it, expect } from 'vitest';
import { calculateMilestoneTaskProgress, calculateProjectMilestoneProgress } from './progress';

describe('calculateMilestoneTaskProgress', () => {
  it('returns 0 for zero eligible tasks (not 100)', () => {
    expect(calculateMilestoneTaskProgress({ totalEligibleTasks: 0, completedEligibleTasks: 0, milestoneStatus: 'pending' })).toBe(0);
  });

  it('returns 0 when all eligible tasks are open', () => {
    expect(calculateMilestoneTaskProgress({ totalEligibleTasks: 4, completedEligibleTasks: 0, milestoneStatus: 'in_progress' })).toBe(0);
  });

  it('returns 75 for 3 of 4 completed', () => {
    expect(calculateMilestoneTaskProgress({ totalEligibleTasks: 4, completedEligibleTasks: 3, milestoneStatus: 'in_progress' })).toBe(75);
  });

  it('returns 100 when all eligible tasks are completed', () => {
    expect(calculateMilestoneTaskProgress({ totalEligibleTasks: 4, completedEligibleTasks: 4, milestoneStatus: 'in_progress' })).toBe(100);
  });

  it('forces 100 for a completed milestone regardless of task counts', () => {
    expect(calculateMilestoneTaskProgress({ totalEligibleTasks: 4, completedEligibleTasks: 1, milestoneStatus: 'completed' })).toBe(100);
  });

  it('rounds to the nearest integer', () => {
    // 1/3 = 33.33...
    expect(calculateMilestoneTaskProgress({ totalEligibleTasks: 3, completedEligibleTasks: 1, milestoneStatus: 'in_progress' })).toBe(33);
  });

  it('clamps to 100 even if completed count somehow exceeds total', () => {
    expect(calculateMilestoneTaskProgress({ totalEligibleTasks: 2, completedEligibleTasks: 3, milestoneStatus: 'in_progress' })).toBe(100);
  });
});

describe('calculateProjectMilestoneProgress', () => {
  it('returns 0 for zero milestones (not 100)', () => {
    expect(calculateProjectMilestoneProgress({ milestones: [] })).toBe(0);
  });

  it('returns the milestone value for a single milestone', () => {
    expect(calculateProjectMilestoneProgress({ milestones: [{ progressPercent: 40, status: 'in_progress' }] })).toBe(40);
  });

  it('averages several milestones with equal weighting', () => {
    expect(
      calculateProjectMilestoneProgress({
        milestones: [
          { progressPercent: 100, status: 'completed' },
          { progressPercent: 50, status: 'in_progress' },
          { progressPercent: 0, status: 'pending' },
        ],
      }),
    ).toBe(50);
  });

  it('includes a missed milestone at its stored progress rather than 0 or 100', () => {
    expect(
      calculateProjectMilestoneProgress({
        milestones: [
          { progressPercent: 100, status: 'completed' },
          { progressPercent: 60, status: 'missed' },
        ],
      }),
    ).toBe(80);
  });

  it('excludes cancelled milestones from both sum and count', () => {
    expect(
      calculateProjectMilestoneProgress({
        milestones: [
          { progressPercent: 100, status: 'completed' },
          { progressPercent: 0, status: 'cancelled' },
        ],
      }),
    ).toBe(100);
  });

  it('returns 0 when every milestone is cancelled', () => {
    expect(
      calculateProjectMilestoneProgress({
        milestones: [
          { progressPercent: 50, status: 'cancelled' },
          { progressPercent: 90, status: 'cancelled' },
        ],
      }),
    ).toBe(0);
  });
});
