/**
 * Deterministic change detection (Slice 5, spec "Changes since previous").
 *
 * Compares the current evidence snapshot against the compact snapshot
 * stored on the last ready briefing (chief_of_staff_briefings.evidence_snapshot)
 * and produces a bounded list of ChiefOfStaffChange items. Like scoring and
 * analysis, this is entirely deterministic — the AI provider never decides
 * what changed; it may only reword what this service has already found.
 *
 * `buildEvidenceSnapshot` produces the compact record that gets stored on
 * THIS briefing so the NEXT generation can diff against it. We deliberately
 * store a small derived shape (not the full evidence packet) to keep the
 * jsonb column bounded and stable across schema-adjacent changes elsewhere.
 */

import type { ChiefOfStaffChange, ChiefOfStaffChangeType, ChiefOfStaffEvidenceReference, ChiefOfStaffRisk } from '@/types/chief-of-staff';
import type { EvidenceProjectRow, EvidenceMilestoneRow, EvidenceTaskRow, ReconciliationRunRecord } from '@/services/chief-of-staff-analysis.service';

export interface EvidenceSnapshotProject {
  name: string;
  status: string;
  health: string;
  founder_required: boolean;
  priority_level: string;
  progress_percent: number;
  target_date: string | null;
}

export interface EvidenceSnapshotMilestone {
  title: string;
  project_id: string;
  status: string;
  health: string;
  due_date: string | null;
}

export interface EvidenceSnapshotTask {
  title: string;
  project_id: string;
  status: string;
  founder_required: boolean;
  due_at: string | null;
}

export interface EvidenceSnapshot {
  capturedAt: string;
  projects: Record<string, EvidenceSnapshotProject>;
  milestones: Record<string, EvidenceSnapshotMilestone>;
  tasks: Record<string, EvidenceSnapshotTask>;
  reconciliationFailureCount: number | null;
  topRiskIds: string[];
}

export function buildEvidenceSnapshot(
  projects: EvidenceProjectRow[],
  milestones: EvidenceMilestoneRow[],
  tasks: EvidenceTaskRow[],
  lastReconciliationRun: ReconciliationRunRecord | null,
  currentRisks: ChiefOfStaffRisk[],
): EvidenceSnapshot {
  const projectMap: Record<string, EvidenceSnapshotProject> = {};
  for (const p of projects) {
    projectMap[p.id] = {
      name: p.name,
      status: p.status,
      health: p.health,
      founder_required: p.founder_required,
      priority_level: p.priority_level,
      progress_percent: p.progress_percent,
      target_date: p.target_date,
    };
  }

  const milestoneMap: Record<string, EvidenceSnapshotMilestone> = {};
  for (const m of milestones) {
    milestoneMap[m.id] = { title: m.title, project_id: m.project_id, status: m.status, health: m.health, due_date: m.due_date };
  }

  const taskMap: Record<string, EvidenceSnapshotTask> = {};
  for (const t of tasks) {
    taskMap[t.id] = { title: t.title, project_id: t.project_id, status: t.status, founder_required: t.founder_required, due_at: t.due_at };
  }

  return {
    capturedAt: new Date().toISOString(),
    projects: projectMap,
    milestones: milestoneMap,
    tasks: taskMap,
    reconciliationFailureCount: lastReconciliationRun?.metadata?.failure_count ?? null,
    topRiskIds: currentRisks.slice(0, 8).map((r) => r.id),
  };
}

function ref(entity_type: ChiefOfStaffEvidenceReference['entity_type'], entity_id: string, label: string): ChiefOfStaffEvidenceReference {
  return { entity_type, entity_id, label };
}

function push(list: ChiefOfStaffChange[], change_type: ChiefOfStaffChangeType, description: string, evidence: ChiefOfStaffEvidenceReference[], previous_value?: string, new_value?: string) {
  list.push({ id: `change-${list.length}-${change_type}`, change_type, description, previous_value, new_value, evidence });
}

const HEALTH_SEVERITY_RANK: Record<string, number> = { healthy: 0, unknown: 0, on_track: 0, needs_attention: 1, at_risk: 2, off_track: 3 };

/**
 * Compares current evidence rows against the previous stored snapshot.
 * Returns [] (not an error) when there is no previous snapshot — the very
 * first briefing for an org has nothing to diff against.
 */
export function detectChanges(
  currentProjects: EvidenceProjectRow[],
  currentMilestones: EvidenceMilestoneRow[],
  currentTasks: EvidenceTaskRow[],
  currentRisks: ChiefOfStaffRisk[],
  previous: EvidenceSnapshot | null,
  currentReconciliationFailureCount: number | null = null,
): ChiefOfStaffChange[] {
  const changes: ChiefOfStaffChange[] = [];
  if (!previous) return changes;

  for (const project of currentProjects) {
    const prior = previous.projects[project.id];
    if (!prior) {
      push(changes, 'new_project', `${project.name} was added.`, [ref('project', project.id, project.name)]);
      continue;
    }

    const priorSeverity = HEALTH_SEVERITY_RANK[prior.health] ?? 0;
    const currentSeverity = HEALTH_SEVERITY_RANK[project.health] ?? 0;
    if (currentSeverity > priorSeverity) {
      push(changes, 'project_health_worsened', `${project.name} health moved from ${prior.health} to ${project.health}.`, [ref('project', project.id, project.name, )], prior.health, project.health);
    } else if (currentSeverity < priorSeverity) {
      push(changes, 'project_health_improved', `${project.name} health improved from ${prior.health} to ${project.health}.`, [ref('project', project.id, project.name)], prior.health, project.health);
    }

    if (!prior.founder_required && project.founder_required) {
      push(changes, 'project_became_founder_required', `${project.name} now requires founder attention.`, [ref('project', project.id, project.name)]);
    }

    if (prior.priority_level !== project.priority_level) {
      push(changes, 'priority_changed', `${project.name} priority changed from ${prior.priority_level} to ${project.priority_level}.`, [ref('project', project.id, project.name)], prior.priority_level, project.priority_level);
    }

    if (Math.abs(prior.progress_percent - project.progress_percent) >= 15) {
      push(changes, 'progress_changed', `${project.name} progress moved from ${prior.progress_percent}% to ${project.progress_percent}%.`, [ref('project', project.id, project.name)], `${prior.progress_percent}%`, `${project.progress_percent}%`);
    }

    if (prior.target_date !== project.target_date) {
      push(changes, 'deadline_changed', `${project.name} target date changed.`, [ref('project', project.id, project.name)], prior.target_date ?? 'none', project.target_date ?? 'none');
    }
  }

  for (const milestone of currentMilestones) {
    const prior = previous.milestones[milestone.id];
    if (!prior) continue;

    if (prior.status !== 'completed' && milestone.status === 'completed') {
      push(changes, 'milestone_completed', `Milestone "${milestone.title}" was completed.`, [ref('milestone', milestone.id, milestone.title)]);
    }

    if (
      milestone.due_date &&
      milestone.status !== 'completed' &&
      milestone.status !== 'cancelled' &&
      new Date(milestone.due_date).getTime() < Date.now() &&
      (!prior.due_date || new Date(prior.due_date).getTime() >= new Date(previous.capturedAt).getTime())
    ) {
      push(changes, 'new_overdue_milestone', `Milestone "${milestone.title}" is now overdue.`, [ref('milestone', milestone.id, milestone.title)]);
    }
  }

  for (const task of currentTasks) {
    const prior = previous.tasks[task.id];
    if (!prior) continue;

    if (prior.status !== 'blocked' && task.status === 'blocked') {
      push(changes, 'task_became_blocked', `Task "${task.title}" became blocked.`, [ref('task', task.id, task.title)]);
    }
    if ((prior.status === 'completed' || prior.status === 'done') === false && (task.status === 'completed' || task.status === 'done')) {
      push(changes, 'task_completed', `Task "${task.title}" was completed.`, [ref('task', task.id, task.title)]);
    }
  }

  const priorReconciliationFailures = previous.reconciliationFailureCount ?? 0;
  const currentReconciliationFailures = currentReconciliationFailureCount ?? 0;
  if (priorReconciliationFailures === 0 && currentReconciliationFailures > 0) {
    push(changes, 'reconciliation_discrepancy_appeared', 'Execution roll-up reconciliation reported new failures.', []);
  } else if (priorReconciliationFailures > 0 && currentReconciliationFailures === 0) {
    push(changes, 'reconciliation_discrepancy_resolved', 'Execution roll-up reconciliation failures have cleared.', []);
  }

  const currentRiskIds = new Set(currentRisks.slice(0, 8).map((r) => r.id));
  for (const riskId of currentRiskIds) {
    if (!previous.topRiskIds.includes(riskId)) {
      const risk = currentRisks.find((r) => r.id === riskId);
      if (risk) push(changes, 'risk_entered_top_set', `New top risk: ${risk.title}.`, risk.evidence);
    }
  }
  for (const priorRiskId of previous.topRiskIds) {
    if (!currentRiskIds.has(priorRiskId)) {
      push(changes, 'risk_left_top_set', 'A previously top-ranked risk is no longer in the top set.', []);
    }
  }

  return changes.slice(0, 8).map((c, i) => ({ ...c, id: `change-${i}-${c.change_type}`, evidence: c.evidence.length > 0 ? c.evidence : [ref('activity', 'change-detection', 'Change detection')] }));
}
