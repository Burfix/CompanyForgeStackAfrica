/**
 * Deterministic company-state analysis (Slice 5).
 *
 * This is the engine that runs BEFORE any AI call. It is responsible for
 * every factual conclusion the Chief of Staff can reach — overdue states,
 * health severity, blocked/waiting classification, decision candidates,
 * safe-to-ignore eligibility, and top-priority ranking. The AI provider
 * (services/ai/chief-of-staff-provider.ts) is only ever allowed to reword
 * or consolidate what this engine has already determined — it is never
 * asked to discover any of this itself, and every item it's allowed to
 * return must trace back to an id produced here.
 */

import {
  scoreProject,
  scoreMilestone,
  scoreTask,
  CHIEF_OF_STAFF_SCORING_VERSION,
  type ScorableProject,
  type ScorableMilestone,
  type ScorableTask,
} from '@/lib/chief-of-staff-scoring';
import type {
  ChiefOfStaffBlocker,
  ChiefOfStaffDecision,
  ChiefOfStaffEvidenceReference,
  ChiefOfStaffIgnoreItem,
  ChiefOfStaffRisk,
  ChiefOfStaffReconciliationHealth,
  DeterministicCompanyAnalysis,
  DeterministicScoredEntity,
} from '@/types/chief-of-staff';

// ---------------------------------------------------------------------
// Evidence row shapes — match repositories/chief-of-staff.repository.ts's
// column selections exactly (snake_case, straight off the Supabase
// client), plus the joined owner/assignee relation as a nested object.
// ---------------------------------------------------------------------

export interface EvidenceProjectRow extends ScorableProject {
  id: string;
  name: string;
  owner: { id: string; full_name: string | null } | null;
  health_note: string | null;
  next_review_at: string | null;
  updated_at: string;
  archived_at: string | null;
}

export interface EvidenceMilestoneRow extends ScorableMilestone {
  id: string;
  project_id: string;
  title: string;
  health_note: string | null;
  waiting_on: string | null;
  blocked_reason: string | null;
  updated_at: string;
}

export interface EvidenceTaskRow extends ScorableTask {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  assignee: { id: string; full_name: string | null } | null;
  waiting_on: string | null;
  blocked_reason: string | null;
  updated_at: string;
}

export interface ReconciliationRunRecord {
  occurred_at: string;
  metadata: {
    milestone_corrections?: number;
    project_corrections?: number;
    failure_count?: number;
  } | null;
}

// Consolidation weights: how much a project's OWN score, its most
// attention-worthy milestone, and its most attention-worthy task each
// contribute to that project's single consolidated priority candidate.
// This is what makes "don't list a project, its milestone, and its task
// as three separate top priorities" a structural guarantee rather than a
// prompt instruction — every candidate IS a project, pre-merged with its
// most urgent milestone/task context.
const CONSOLIDATION_WEIGHTS = { project: 1, milestone: 0.6, task: 0.3 } as const;

function evidenceRef(
  entity_type: ChiefOfStaffEvidenceReference['entity_type'],
  entity_id: string,
  label: string,
  field?: string,
  value?: string,
): ChiefOfStaffEvidenceReference {
  return { entity_type, entity_id, label, field, value };
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface AnalysisInput {
  projects: EvidenceProjectRow[];
  milestones: EvidenceMilestoneRow[];
  tasks: EvidenceTaskRow[];
  lastReconciliationRun: ReconciliationRunRecord | null;
  founderUserId: string | null;
  now?: Date;
}

function buildReconciliationHealth(record: ReconciliationRunRecord | null): ChiefOfStaffReconciliationHealth {
  if (!record) {
    return { lastRunAt: null, milestoneCorrections: null, projectCorrections: null, failureCount: null, isKnownConsistent: false };
  }
  const failureCount = record.metadata?.failure_count ?? 0;
  return {
    lastRunAt: record.occurred_at,
    milestoneCorrections: record.metadata?.milestone_corrections ?? 0,
    projectCorrections: record.metadata?.project_corrections ?? 0,
    failureCount,
    isKnownConsistent: failureCount === 0,
  };
}

/**
 * The single entry point: turns bounded evidence rows into a fully scored,
 * risk/blocker/decision/safe-to-ignore analysis. Deterministic given the
 * same input and `now` — no randomness, no external calls.
 */
export function analyzeCompanyState(input: AnalysisInput): DeterministicCompanyAnalysis {
  const now = input.now ?? new Date();
  const activeProjects = input.projects.filter((p) => p.status !== 'completed' && p.status !== 'cancelled' && !p.archived_at);

  const milestonesByProject = new Map<string, EvidenceMilestoneRow[]>();
  for (const m of input.milestones) {
    const list = milestonesByProject.get(m.project_id) ?? [];
    list.push(m);
    milestonesByProject.set(m.project_id, list);
  }

  const tasksByProject = new Map<string, EvidenceTaskRow[]>();
  const tasksByMilestone = new Map<string, EvidenceTaskRow[]>();
  for (const t of input.tasks) {
    const projList = tasksByProject.get(t.project_id) ?? [];
    projList.push(t);
    tasksByProject.set(t.project_id, projList);
    if (t.milestone_id) {
      const msList = tasksByMilestone.get(t.milestone_id) ?? [];
      msList.push(t);
      tasksByMilestone.set(t.milestone_id, msList);
    }
  }

  const priorityCandidates = buildPriorityCandidates(activeProjects, milestonesByProject, tasksByProject, input.founderUserId, now);
  const risks = buildRisks(activeProjects, input.milestones, input.lastReconciliationRun, now);
  const blockers = buildBlockers(activeProjects, input.milestones, input.tasks);
  const decisions = buildDecisions(activeProjects, input.milestones, input.tasks, now);
  const safeToIgnore = buildSafeToIgnore(activeProjects, input.milestones, input.tasks, input.founderUserId, now);

  const allTimestamps = [
    ...input.projects.map((p) => p.updated_at),
    ...input.milestones.map((m) => m.updated_at),
    ...input.tasks.map((t) => t.updated_at),
  ].filter(Boolean) as string[];
  const latestActivityAt = allTimestamps.length > 0 ? allTimestamps.sort().at(-1)! : null;

  return {
    scoringVersion: CHIEF_OF_STAFF_SCORING_VERSION,
    dataAsOf: now.toISOString(),
    priorityCandidates,
    risks,
    blockers,
    decisions,
    safeToIgnore,
    reconciliation: buildReconciliationHealth(input.lastReconciliationRun),
    sourceRecordCount: input.projects.length + input.milestones.length + input.tasks.length,
    latestActivityAt,
  };
}

function buildPriorityCandidates(
  projects: EvidenceProjectRow[],
  milestonesByProject: Map<string, EvidenceMilestoneRow[]>,
  tasksByProject: Map<string, EvidenceTaskRow[]>,
  founderUserId: string | null,
  now: Date,
): DeterministicScoredEntity[] {
  const candidates: DeterministicScoredEntity[] = [];

  for (const project of projects) {
    const projectScore = scoreProject(project, now);
    const milestones = milestonesByProject.get(project.id) ?? [];
    const tasks = tasksByProject.get(project.id) ?? [];

    let bestMilestone: { row: EvidenceMilestoneRow; score: number; reasons: string[] } | null = null;
    for (const m of milestones) {
      const result = scoreMilestone(m, { connectedProjectFocusLevel: project.focus_level }, now);
      if (!bestMilestone || result.score > bestMilestone.score) {
        bestMilestone = { row: m, score: result.score, reasons: result.reasons };
      }
    }

    let bestTask: { row: EvidenceTaskRow; score: number; reasons: string[] } | null = null;
    for (const t of tasks) {
      const result = scoreTask(t, { founderUserId }, now);
      if (!bestTask || result.score > bestTask.score) {
        bestTask = { row: t, score: result.score, reasons: result.reasons };
      }
    }

    const aggregateScore =
      projectScore.score * CONSOLIDATION_WEIGHTS.project +
      (bestMilestone?.score ?? 0) * CONSOLIDATION_WEIGHTS.milestone +
      (bestTask?.score ?? 0) * CONSOLIDATION_WEIGHTS.task;

    if (aggregateScore <= 0) continue;

    const reasons = [...projectScore.reasons];
    if (bestMilestone && bestMilestone.score > 0) reasons.push(...bestMilestone.reasons.map((r) => `Milestone "${bestMilestone!.row.title}": ${r}`));
    if (bestTask && bestTask.score > 0) reasons.push(...bestTask.reasons.map((r) => `Task "${bestTask!.row.title}": ${r}`));

    const evidence: ChiefOfStaffEvidenceReference[] = [
      evidenceRef('project', project.id, project.name, 'attention_mode', project.attention_mode),
    ];
    if (bestMilestone && bestMilestone.score > 0) {
      evidence.push(evidenceRef('milestone', bestMilestone.row.id, bestMilestone.row.title, 'due_date', bestMilestone.row.due_date ?? undefined));
    }
    if (bestTask && bestTask.score > 0) {
      evidence.push(evidenceRef('task', bestTask.row.id, bestTask.row.title, 'due_at', bestTask.row.due_at ?? undefined));
    }

    candidates.push({
      entityType: 'project',
      entityId: project.id,
      projectId: project.id,
      milestoneId: bestMilestone?.row.id,
      label: project.name,
      score: Math.round(aggregateScore * 10) / 10,
      reasons,
      evidence,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function buildRisks(
  projects: EvidenceProjectRow[],
  milestones: EvidenceMilestoneRow[],
  lastReconciliationRun: ReconciliationRunRecord | null,
  now: Date,
): ChiefOfStaffRisk[] {
  const risks: ChiefOfStaffRisk[] = [];

  for (const project of projects) {
    if (project.health === 'off_track') {
      risks.push({
        id: `risk-project-delivery-${project.id}`,
        title: `${project.name} is off track`,
        category: 'delivery',
        severity: project.founder_required ? 'urgent' : 'high',
        explanation: project.health_note
          ? truncate(project.health_note)
          : 'Project health is recorded as Off Track with no recovery note on file.',
        likely_consequence: 'The desired outcome is unlikely to be met on its current trajectory without intervention.',
        confidence: 'high',
        time_horizon: project.target_date ? `By ${project.target_date}` : 'Ongoing',
        evidence: [evidenceRef('project', project.id, project.name, 'health', project.health)],
      });
    }

    if (project.target_date) {
      const overdueDays = Math.round((now.getTime() - new Date(project.target_date).getTime()) / 86_400_000);
      if (overdueDays > 0) {
        risks.push({
          id: `risk-project-deadline-${project.id}`,
          title: `${project.name} has passed its target date`,
          category: 'deadline',
          severity: overdueDays > 14 ? 'urgent' : 'high',
          explanation: `Target date was ${project.target_date}, now ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue.`,
          likely_consequence: 'A stated deadline has already been missed without a recorded change.',
          confidence: 'high',
          time_horizon: 'Already overdue',
          evidence: [evidenceRef('project', project.id, project.name, 'target_date', project.target_date)],
        });
      }
    }

    if (project.founder_required && project.health === 'at_risk' && (project.business_impact ?? []).includes('revenue')) {
      risks.push({
        id: `risk-project-commercial-${project.id}`,
        title: `${project.name} carries commercial risk`,
        category: 'commercial',
        severity: 'high',
        explanation: 'Project is tagged as revenue-impacting, at risk, and requires founder attention.',
        likely_consequence: 'Revenue-linked outcomes tied to this project may slip.',
        confidence: 'medium',
        time_horizon: project.next_review_at ? `Next review ${project.next_review_at}` : 'Ongoing',
        evidence: [
          evidenceRef('project', project.id, project.name, 'business_impact', project.business_impact.join(',')),
          evidenceRef('project', project.id, project.name, 'health', project.health),
        ],
      });
    }
  }

  for (const milestone of milestones) {
    if (milestone.status === 'cancelled' || milestone.status === 'completed') continue;
    if (milestone.due_date) {
      const overdueDays = Math.round((now.getTime() - new Date(milestone.due_date).getTime()) / 86_400_000);
      if (overdueDays > 0) {
        risks.push({
          id: `risk-milestone-deadline-${milestone.id}`,
          title: `${milestone.title} is overdue`,
          category: 'deadline',
          severity: milestone.founder_required ? 'urgent' : 'high',
          explanation: `Due date was ${milestone.due_date}, now ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue.`,
          likely_consequence: 'Downstream project progress will stall until this milestone resolves.',
          confidence: 'high',
          time_horizon: 'Already overdue',
          evidence: [evidenceRef('milestone', milestone.id, milestone.title, 'due_date', milestone.due_date)],
        });
      }
    }
  }

  if (lastReconciliationRun && (lastReconciliationRun.metadata?.failure_count ?? 0) > 0) {
    risks.push({
      id: `risk-data-integrity-reconciliation`,
      title: 'Execution roll-up reconciliation reported failures',
      category: 'data_integrity',
      severity: 'medium',
      explanation: `The last reconciliation run (${lastReconciliationRun.occurred_at}) recorded ${lastReconciliationRun.metadata?.failure_count} project failure(s).`,
      likely_consequence: 'Some project or milestone progress figures may not reflect actual task completion until reconciled.',
      confidence: 'high',
      time_horizon: 'Since last reconciliation run',
      evidence: [],
    });
  }

  return risks
    .sort((a, b) => (URGENCY_RANK[b.severity] ?? 0) - (URGENCY_RANK[a.severity] ?? 0))
    .slice(0, 8)
    .map((r) => (r.evidence.length === 0 ? { ...r, evidence: [evidenceRef('activity', 'reconciliation', 'Execution reconciliation run')] } : r));
}

const URGENCY_RANK: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

function buildBlockers(projects: EvidenceProjectRow[], milestones: EvidenceMilestoneRow[], tasks: EvidenceTaskRow[]): ChiefOfStaffBlocker[] {
  const blockers: ChiefOfStaffBlocker[] = [];

  for (const project of projects) {
    if (project.blocked_reason) {
      blockers.push({
        id: `blocker-project-${project.id}`,
        kind: 'blocked',
        title: project.name,
        project_id: project.id,
        reason: truncate(project.blocked_reason),
        suggested_attention: project.founder_required ? 'urgent' : 'high',
        evidence: [evidenceRef('project', project.id, project.name, 'blocked_reason', project.blocked_reason)],
      });
    } else if (project.waiting_on) {
      blockers.push({
        id: `blocker-project-waiting-${project.id}`,
        kind: 'waiting',
        title: project.name,
        project_id: project.id,
        reason: truncate(project.waiting_on),
        waiting_on: truncate(project.waiting_on, 100),
        suggested_attention: project.founder_required ? 'high' : 'low',
        evidence: [evidenceRef('project', project.id, project.name, 'waiting_on', project.waiting_on)],
      });
    }
  }

  for (const milestone of milestones) {
    if (milestone.status === 'blocked' && milestone.blocked_reason) {
      blockers.push({
        id: `blocker-milestone-${milestone.id}`,
        kind: 'blocked',
        title: milestone.title,
        project_id: milestone.project_id,
        reason: truncate(milestone.blocked_reason),
        due_date: milestone.due_date ?? undefined,
        suggested_attention: milestone.founder_required ? 'urgent' : 'high',
        evidence: [evidenceRef('milestone', milestone.id, milestone.title, 'blocked_reason', milestone.blocked_reason)],
      });
    } else if (milestone.status === 'waiting' && milestone.waiting_on) {
      blockers.push({
        id: `blocker-milestone-waiting-${milestone.id}`,
        kind: 'waiting',
        title: milestone.title,
        project_id: milestone.project_id,
        reason: truncate(milestone.waiting_on),
        waiting_on: truncate(milestone.waiting_on, 100),
        due_date: milestone.due_date ?? undefined,
        suggested_attention: milestone.founder_required ? 'high' : 'low',
        evidence: [evidenceRef('milestone', milestone.id, milestone.title, 'waiting_on', milestone.waiting_on)],
      });
    }
  }

  for (const task of tasks) {
    if (task.status === 'blocked' && task.blocked_reason) {
      blockers.push({
        id: `blocker-task-${task.id}`,
        kind: 'blocked',
        title: task.title,
        project_id: task.project_id,
        reason: truncate(task.blocked_reason),
        due_date: task.due_at?.slice(0, 10) ?? undefined,
        suggested_attention: task.founder_required ? 'urgent' : 'medium',
        evidence: [evidenceRef('task', task.id, task.title, 'blocked_reason', task.blocked_reason)],
      });
    } else if (task.status === 'waiting' && task.waiting_on) {
      blockers.push({
        id: `blocker-task-waiting-${task.id}`,
        kind: 'waiting',
        title: task.title,
        project_id: task.project_id,
        reason: truncate(task.waiting_on),
        waiting_on: truncate(task.waiting_on, 100),
        due_date: task.due_at?.slice(0, 10) ?? undefined,
        suggested_attention: task.founder_required ? 'high' : 'low',
        evidence: [evidenceRef('task', task.id, task.title, 'waiting_on', task.waiting_on)],
      });
    }
  }

  return blockers.slice(0, 12);
}

function buildDecisions(
  projects: EvidenceProjectRow[],
  milestones: EvidenceMilestoneRow[],
  tasks: EvidenceTaskRow[],
  now: Date,
): ChiefOfStaffDecision[] {
  const decisions: ChiefOfStaffDecision[] = [];

  for (const project of projects) {
    const reviewOverdue = project.next_review_at && new Date(project.next_review_at).getTime() < now.getTime();

    if (project.founder_required && reviewOverdue) {
      decisions.push({
        id: `decision-project-review-${project.id}`,
        title: `Review overdue: ${project.name}`,
        question: `What is the next step for ${project.name}?`,
        why_now: 'This project requires founder attention and its scheduled review date has already passed.',
        deadline: project.next_review_at ?? undefined,
        consequence_of_delay: 'The project continues without founder direction past its planned check-in point.',
        confidence: 'high',
        evidence: [evidenceRef('project', project.id, project.name, 'next_review_at', project.next_review_at ?? undefined)],
      });
    }

    if (project.health === 'off_track' && !project.health_note) {
      decisions.push({
        id: `decision-project-recovery-${project.id}`,
        title: `Recovery plan needed: ${project.name}`,
        question: `Should ${project.name} continue as-is, be re-scoped, or be paused?`,
        why_now: 'Project health is Off Track with no recovery note recorded.',
        consequence_of_delay: 'Without a documented plan, the project may continue to slip with no accountable next step.',
        missing_information: 'A health note explaining the recovery plan has not been recorded.',
        confidence: 'medium',
        evidence: [evidenceRef('project', project.id, project.name, 'health', project.health)],
      });
    }
  }

  for (const milestone of milestones) {
    if (milestone.founder_required && milestone.status === 'blocked') {
      decisions.push({
        id: `decision-milestone-blocked-${milestone.id}`,
        title: `Unblock: ${milestone.title}`,
        question: milestone.blocked_reason ? `How should "${milestone.blocked_reason}" be resolved?` : `What is blocking ${milestone.title}?`,
        why_now: 'This milestone requires founder attention and is currently blocked.',
        deadline: milestone.due_date ?? undefined,
        consequence_of_delay: 'Tasks tied to this milestone cannot progress while it remains blocked.',
        confidence: 'high',
        evidence: [evidenceRef('milestone', milestone.id, milestone.title, 'blocked_reason', milestone.blocked_reason ?? undefined)],
      });
    }
  }

  for (const task of tasks) {
    if (task.founder_required && !task.next_action && task.status !== 'completed' && task.status !== 'done' && task.status !== 'cancelled') {
      decisions.push({
        id: `decision-task-next-action-${task.id}`,
        title: `Next action needed: ${task.title}`,
        question: `What is the next action for ${task.title}?`,
        why_now: 'This task requires founder attention and has no next action recorded.',
        deadline: task.due_at?.slice(0, 10) ?? undefined,
        consequence_of_delay: 'The task has no recorded path forward and may stall silently.',
        missing_information: 'No next_action value is recorded on the task.',
        confidence: 'medium',
        evidence: [evidenceRef('task', task.id, task.title, 'next_action', 'missing')],
      });
    }
  }

  return decisions.slice(0, 8);
}

function buildSafeToIgnore(
  projects: EvidenceProjectRow[],
  milestones: EvidenceMilestoneRow[],
  tasks: EvidenceTaskRow[],
  founderUserId: string | null,
  now: Date,
): ChiefOfStaffIgnoreItem[] {
  const items: ChiefOfStaffIgnoreItem[] = [];
  const HEALTHY_STATES = new Set(['healthy', 'on_track']);

  for (const project of projects) {
    if (
      project.attention_mode === 'delegated' &&
      HEALTHY_STATES.has(project.health) &&
      !project.founder_required &&
      !project.blocked_reason
    ) {
      items.push({
        id: `ignore-project-${project.id}`,
        title: project.name,
        reason: 'Delegated ownership, healthy status, and no founder attention required.',
        reactivation_condition: 'Health changes to At Risk/Off Track, or attention mode changes to founder.',
        evidence: [evidenceRef('project', project.id, project.name, 'health', project.health)],
      });
    }
  }

  for (const milestone of milestones) {
    if (
      (milestone.status === 'pending' || milestone.status === 'in_progress') &&
      (milestone.health === 'healthy' || milestone.health === 'unknown') &&
      !milestone.founder_required
    ) {
      const dueSoon = milestone.due_date ? new Date(milestone.due_date).getTime() - now.getTime() < 7 * 86_400_000 : false;
      if (!dueSoon) {
        items.push({
          id: `ignore-milestone-${milestone.id}`,
          title: milestone.title,
          reason: 'Progressing normally with no founder attention required and no near-term deadline.',
          valid_until: milestone.due_date ?? undefined,
          reactivation_condition: 'Becomes overdue, blocked, or founder-required.',
          evidence: [evidenceRef('milestone', milestone.id, milestone.title, 'status', milestone.status)],
        });
      }
    }
  }

  for (const task of tasks) {
    const isOverdue = task.due_at ? new Date(task.due_at).getTime() < now.getTime() : false;
    const assignedToSomeoneElse = task.assignee?.id && task.assignee.id !== founderUserId;
    if (assignedToSomeoneElse && !isOverdue && !task.founder_required && task.status !== 'blocked') {
      items.push({
        id: `ignore-task-${task.id}`,
        title: task.title,
        reason: `Assigned to ${task.assignee?.full_name ?? 'another team member'} and not overdue.`,
        valid_until: task.due_at ?? undefined,
        reactivation_condition: 'Becomes overdue, blocked, or reassigned to the founder.',
        evidence: [evidenceRef('task', task.id, task.title, 'assignee_id', task.assignee?.id)],
      });
    } else if (task.status === 'waiting' && !task.founder_required && task.waiting_on) {
      items.push({
        id: `ignore-task-waiting-${task.id}`,
        title: task.title,
        reason: 'Waiting on an external party — no founder action is required while it waits.',
        reactivation_condition: 'The wait is resolved or the task becomes overdue.',
        evidence: [evidenceRef('task', task.id, task.title, 'waiting_on', task.waiting_on)],
      });
    }
  }

  return items.slice(0, 10);
}
