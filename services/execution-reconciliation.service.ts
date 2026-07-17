/**
 * Deterministic reconciliation layer for the milestone/project execution
 * roll-up (Slice 4.5 — Data Integrity and Roll-up Reliability Hardening).
 *
 * Why this exists: task mutations and their milestone/project progress
 * recalculations happen through separate repository calls with no shared
 * database transaction (see the "transaction honesty" comments in
 * milestone.service.ts / milestones.repository.ts — the Supabase JS client
 * used here has no multi-statement transaction primitive). A failed
 * network call, a crashed process, or a bug between the primary mutation
 * and its roll-up write can leave progress_percent briefly (or, in a
 * pathological case, indefinitely) out of sync with what the eligible
 * tasks/milestones actually say. This module recomputes the same
 * deterministic, non-AI formulas already used in production
 * (lib/progress.ts) and compares them against what's stored — nothing
 * here introduces a second, different notion of "correct."
 *
 * This is explicitly NOT a scheduled job (Part 6 of the spec says not to
 * automate it yet) — it is invoked on demand, either for one
 * project/milestone or, bounded and batched, for a whole organisation, via
 * the admin-only Server Action in features/admin/actions.ts.
 *
 * Dry-run is the safe default posture for the admin UI: it calculates and
 * reports every discrepancy it finds without writing anything or logging
 * any activity — see the `dryRun` option on every method below.
 */

import { milestonesRepository } from '@/repositories/milestones.repository';
import { projectsRepository } from '@/repositories/projects.repository';
import { activityRepository } from '@/repositories/activity.repository';
import { calculateMilestoneTaskProgress, calculateProjectMilestoneProgress } from '@/lib/progress';
import { NotFoundError } from '@/lib/errors';
import type { MilestoneStatus } from '@/schemas/milestone.schema';
import type { Json } from '@/types/database.types';

export interface ReconcileOptions {
  /** When true (the recommended default for any org-wide run), calculates
   * and returns discrepancies but writes nothing and logs no activity. */
  dryRun?: boolean;
}

export interface MilestoneReconciliationResult {
  milestoneId: string;
  projectId: string;
  progressMode: string;
  /** True when this milestone was NOT evaluated for correction at all
   * (manual mode) — distinct from `corrected: false`, which means it WAS
   * evaluated and found already correct. */
  skipped: boolean;
  skipReason?: string;
  storedProgress: number;
  /** null only when skipped — a manual milestone has no "expected" value,
   * because automatic recalculation is never allowed to touch it. */
  expectedProgress: number | null;
  corrected: boolean;
}

export interface ProjectReconciliationResult {
  projectId: string;
  progressMode: string;
  skipped: boolean;
  skipReason?: string;
  storedProgress: number;
  expectedProgress: number | null;
  corrected: boolean;
}

export interface ProjectExecutionReconciliationResult {
  projectId: string;
  milestonesChecked: number;
  milestoneCorrections: number;
  milestoneResults: MilestoneReconciliationResult[];
  projectResult: ProjectReconciliationResult;
}

export interface OrganisationExecutionReconciliationResult {
  dryRun: boolean;
  projectsChecked: number;
  milestonesChecked: number;
  milestoneCorrections: number;
  projectCorrections: number;
  failures: { projectId: string; message: string }[];
  projectResults: ProjectExecutionReconciliationResult[];
}

// A hard ceiling on how many projects one reconciliation call will ever
// touch — "bounded batches", never an unbounded organisation-wide scan
// (Part 6 / Part 12 of the spec). An organisation with more projects than
// this needs multiple reconciliation calls (e.g. paginated from the admin
// UI), not a single all-at-once sweep.
const MAX_PROJECTS_PER_RUN = 200;
const DEFAULT_BATCH_SIZE = 25;

export const executionReconciliationService = {
  /**
   * Recomputes one milestone's automatic progress from its eligible tasks
   * (same formula as milestoneService.recalculateMilestoneProgress) and
   * reports — or, unless dryRun, corrects — any discrepancy. Never
   * overwrites a manual-mode milestone; that is reported as `skipped`,
   * never silently "corrected to itself."
   */
  async reconcileMilestoneProgress(
    organizationId: string,
    actorId: string,
    milestoneId: string,
    options: ReconcileOptions = {},
  ): Promise<MilestoneReconciliationResult> {
    const dryRun = options.dryRun ?? false;
    const milestone = await milestonesRepository.getMilestoneForMutation(organizationId, milestoneId);
    if (!milestone) {
      throw new NotFoundError('Milestone not found.');
    }

    if (milestone.progress_mode === 'manual') {
      return {
        milestoneId,
        projectId: milestone.project_id,
        progressMode: 'manual',
        skipped: true,
        skipReason: 'Milestone progress is manually managed — automatic reconciliation never overwrites it.',
        storedProgress: milestone.progress_percent,
        expectedProgress: null,
        corrected: false,
      };
    }

    const { totalEligibleTasks, completedEligibleTasks } = await milestonesRepository.getTaskCompletionRollup(organizationId, milestoneId);
    const expectedProgress = calculateMilestoneTaskProgress({
      totalEligibleTasks,
      completedEligibleTasks,
      milestoneStatus: milestone.status as MilestoneStatus,
    });

    if (expectedProgress === milestone.progress_percent) {
      return {
        milestoneId,
        projectId: milestone.project_id,
        progressMode: 'automatic',
        skipped: false,
        storedProgress: milestone.progress_percent,
        expectedProgress,
        corrected: false,
      };
    }

    if (!dryRun) {
      await milestonesRepository.updateMilestoneProgress(organizationId, milestoneId, expectedProgress);
      await activityRepository.record({
        organization_id: organizationId,
        actor_id: actorId,
        event_type: 'milestone.progress_recalculated',
        entity_type: 'milestone',
        entity_id: milestoneId,
        title: `Progress reconciled from ${milestone.progress_percent}% to ${expectedProgress}%`,
        metadata: {
          milestone_id: milestoneId,
          project_id: milestone.project_id,
          action: 'progress_recalculated',
          previous_values: { progress_percent: milestone.progress_percent },
          new_values: { progress_percent: expectedProgress },
          source: 'reconciliation',
          calculation_basis: { total_eligible_tasks: totalEligibleTasks, completed_eligible_tasks: completedEligibleTasks },
          performed_by_user_id: actorId,
        } as Json,
      });
    }

    return {
      milestoneId,
      projectId: milestone.project_id,
      progressMode: 'automatic',
      skipped: false,
      storedProgress: milestone.progress_percent,
      expectedProgress,
      corrected: true,
    };
  },

  /**
   * Recomputes one project's milestone-derived progress (equal-weighted
   * roll-up, same formula as
   * milestoneService.recalculateProjectProgressFromMilestones) and
   * reports — or, unless dryRun, corrects — any discrepancy. Never
   * touches a project in 'manual' progress mode.
   */
  async reconcileProjectProgress(
    organizationId: string,
    actorId: string,
    projectId: string,
    options: ReconcileOptions = {},
  ): Promise<ProjectReconciliationResult> {
    const dryRun = options.dryRun ?? false;
    const project = await projectsRepository.getProjectForMutation(organizationId, projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }

    if (project.progress_mode !== 'milestones') {
      return {
        projectId,
        progressMode: project.progress_mode,
        skipped: true,
        skipReason: 'Project progress is manually managed — automatic reconciliation never overwrites it.',
        storedProgress: project.progress_percent,
        expectedProgress: null,
        corrected: false,
      };
    }

    const milestones = await milestonesRepository.listByProject(organizationId, projectId);
    const expectedProgress = calculateProjectMilestoneProgress({
      milestones: milestones.map((m) => ({ progressPercent: m.progress_percent, status: m.status })),
    });

    if (expectedProgress === project.progress_percent) {
      return {
        projectId,
        progressMode: 'milestones',
        skipped: false,
        storedProgress: project.progress_percent,
        expectedProgress,
        corrected: false,
      };
    }

    if (!dryRun) {
      await projectsRepository.update(organizationId, projectId, {
        progress_percent: expectedProgress,
        last_activity_at: new Date().toISOString(),
      });
      await activityRepository.record({
        organization_id: organizationId,
        actor_id: actorId,
        event_type: 'project.progress_recalculated',
        entity_type: 'project',
        entity_id: projectId,
        title: `Progress reconciled from ${project.progress_percent}% to ${expectedProgress}%`,
        metadata: {
          project_id: projectId,
          action: 'progress_recalculated',
          previous_values: { progress_percent: project.progress_percent },
          new_values: { progress_percent: expectedProgress },
          calculation_source: 'milestone_rollup',
          source: 'reconciliation',
          performed_by_user_id: actorId,
        } as Json,
      });
    }

    return {
      projectId,
      progressMode: 'milestones',
      skipped: false,
      storedProgress: project.progress_percent,
      expectedProgress,
      corrected: true,
    };
  },

  /**
   * Full reconciliation pass for one project: every non-cancelled
   * milestone, then the project's own milestone roll-up. Cancelled
   * milestones are excluded entirely — they're already excluded from both
   * the milestone- and project-level formulas, so there's nothing to
   * reconcile for them.
   */
  async reconcileProjectExecution(
    organizationId: string,
    actorId: string,
    projectId: string,
    options: ReconcileOptions = {},
  ): Promise<ProjectExecutionReconciliationResult> {
    const milestones = await milestonesRepository.listByProject(organizationId, projectId);
    const reconcilableMilestones = milestones.filter((m) => m.status !== 'cancelled');

    const milestoneResults: MilestoneReconciliationResult[] = [];
    for (const milestone of reconcilableMilestones) {
      const result = await this.reconcileMilestoneProgress(organizationId, actorId, milestone.id, options);
      milestoneResults.push(result);
    }

    const projectResult = await this.reconcileProjectProgress(organizationId, actorId, projectId, options);

    return {
      projectId,
      milestonesChecked: milestoneResults.length,
      milestoneCorrections: milestoneResults.filter((r) => r.corrected).length,
      milestoneResults,
      projectResult,
    };
  },

  /**
   * Bounded, batched reconciliation across an organisation's projects (or
   * a single project, via `options.projectId`). Never crosses
   * organisation boundaries — every read/write is scoped by
   * `organizationId`, and a `projectId` from another org resolves to
   * NotFoundError exactly like every other org-scoped mutation in this
   * codebase. A failure reconciling one project is captured and the run
   * continues with the next project — one bad project must never abort
   * reconciliation for the rest of the organisation.
   */
  async reconcileOrganisationExecution(
    organizationId: string,
    actorId: string,
    options: ReconcileOptions & { projectId?: string; batchSize?: number } = {},
  ): Promise<OrganisationExecutionReconciliationResult> {
    const dryRun = options.dryRun ?? false;
    const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, DEFAULT_BATCH_SIZE));

    let projects: { id: string }[];
    if (options.projectId) {
      const project = await projectsRepository.getProjectForMutation(organizationId, options.projectId);
      if (!project) {
        throw new NotFoundError('Project not found.');
      }
      projects = [project];
    } else {
      const all = await projectsRepository.listByOrg(organizationId);
      projects = all.slice(0, MAX_PROJECTS_PER_RUN);
    }

    const failures: { projectId: string; message: string }[] = [];
    const projectResults: ProjectExecutionReconciliationResult[] = [];
    let milestonesChecked = 0;
    let milestoneCorrections = 0;
    let projectCorrections = 0;

    for (let i = 0; i < projects.length; i += batchSize) {
      const batch = projects.slice(i, i + batchSize);
      for (const project of batch) {
        try {
          const result = await this.reconcileProjectExecution(organizationId, actorId, project.id, { dryRun });
          projectResults.push(result);
          milestonesChecked += result.milestonesChecked;
          milestoneCorrections += result.milestoneCorrections;
          if (result.projectResult.corrected) projectCorrections += 1;
        } catch (error) {
          // One project's failure is captured with enough context to
          // investigate, and reconciliation continues — never lets a
          // single bad row abort the whole organisation-wide run.
          failures.push({
            projectId: project.id,
            message: error instanceof Error ? error.message : 'Unknown reconciliation failure.',
          });
        }
      }
    }

    if (!dryRun) {
      // Exactly one summary event for the whole run — never one per
      // unchanged record, which would flood the activity timeline (Part 8
      // of the spec).
      await activityRepository.record({
        organization_id: organizationId,
        actor_id: actorId,
        event_type: 'execution.reconciliation_run',
        entity_type: 'organization',
        entity_id: organizationId,
        title: `Execution reconciliation: ${milestoneCorrections} milestone(s) and ${projectCorrections} project(s) corrected`,
        metadata: {
          action: 'reconciliation_run',
          source: 'reconciliation',
          projects_checked: projectResults.length,
          milestones_checked: milestonesChecked,
          milestone_corrections: milestoneCorrections,
          project_corrections: projectCorrections,
          failure_count: failures.length,
          failed_project_ids: failures.map((f) => f.projectId),
          performed_by_user_id: actorId,
        } as Json,
      });
    }

    return {
      dryRun,
      projectsChecked: projectResults.length,
      milestonesChecked,
      milestoneCorrections,
      projectCorrections,
      failures,
      projectResults,
    };
  },
};
