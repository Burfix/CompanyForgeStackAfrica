'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser, getCurrentOrg } from '@/lib/auth/session';
import { projectService } from '@/services/project.service';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { CreateProjectInput, UpdateProjectInput } from '@/schemas/project.schema';

export interface ProjectActionState {
  formError?: string;
  fieldErrors?: Record<string, string[]>;
  requiresOverride?: boolean;
  success?: boolean;
  /**
   * Raw echo of whatever was submitted, keyed by form field name. Populated
   * only on a failed create/update submission so ProjectForm can re-seed
   * every field with what the user actually typed instead of resetting to
   * blank — a validation error must never cost someone their work. See
   * extractSubmittedValues below.
   */
  submittedValues?: Record<string, string | string[]>;
}

/** Generic FormData -> plain object echo. Deliberately not tied to the
 * CreateProjectInput shape (which has already coerced/dropped invalid
 * values by the time a ZodError is thrown) — this reads the raw strings
 * the browser actually sent, so it survives even values that failed
 * validation entirely. */
function extractSubmittedValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of formData.keys()) {
    if (key === 'businessImpact') {
      values[key] = formData.getAll(key).map(String);
      continue;
    }
    const value = formData.get(key);
    if (typeof value === 'string') values[key] = value;
  }
  return values;
}

function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return fieldErrors;
}

function revalidateProjectViews(projectId?: string) {
  revalidatePath('/');
  revalidatePath('/projects');
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

function parseCreateInput(formData: FormData): CreateProjectInput {
  const focusLevelRaw = formData.get('focusLevel');
  const progressRaw = formData.get('progressPercent');
  return {
    name: String(formData.get('name') ?? ''),
    category: String(formData.get('category') ?? ''),
    description: (formData.get('description') as string) || undefined,
    ownerId: (formData.get('ownerId') as string) || undefined,
    status: (formData.get('status') as CreateProjectInput['status']) || 'proposed',
    focusLevel: (focusLevelRaw ? Number(focusLevelRaw) : 3) as CreateProjectInput['focusLevel'],
    desiredOutcome: String(formData.get('desiredOutcome') ?? ''),
    successMetric: (formData.get('successMetric') as string) || undefined,
    targetValue: (formData.get('targetValue') as string) || undefined,
    currentValue: (formData.get('currentValue') as string) || undefined,
    startDate: (formData.get('startDate') as string) || undefined,
    targetDate: (formData.get('targetDate') as string) || undefined,
    nextReviewAt: (formData.get('nextReviewAt') as string) || undefined,
    reviewCadence: (formData.get('reviewCadence') as CreateProjectInput['reviewCadence']) || 'none',
    blockedReason: (formData.get('blockedReason') as string) || undefined,
    waitingOn: (formData.get('waitingOn') as string) || undefined,
    attentionMode: (formData.get('attentionMode') as CreateProjectInput['attentionMode']) || 'no_attention',
    priorityLevel: (formData.get('priorityLevel') as CreateProjectInput['priorityLevel']) || 'medium',
    health: (formData.get('health') as CreateProjectInput['health']) || 'unknown',
    healthNote: (formData.get('healthNote') as string) || undefined,
    businessImpact: formData.getAll('businessImpact').map(String) as CreateProjectInput['businessImpact'],
    progressPercent: (progressRaw ? Number(progressRaw) : 0) as CreateProjectInput['progressPercent'],
    progressMode: (formData.get('progressMode') as CreateProjectInput['progressMode']) || 'manual',
  } as CreateProjectInput;
}

export async function createProject(_prevState: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let project;
  try {
    project = await projectService.createProject(org.organizationId, user.id, parseCreateInput(formData));
  } catch (error) {
    const submittedValues = extractSubmittedValues(formData);
    if (error instanceof z.ZodError) {
      return { fieldErrors: zodFieldErrors(error), submittedValues };
    }
    if (error instanceof BusinessRuleError) {
      return { formError: error.message, submittedValues };
    }
    return { formError: 'Could not create the project. Please try again.', submittedValues };
  }

  revalidateProjectViews(project.id);
  redirect(`/projects/${project.id}`);
}

export async function updateProject(projectId: string, _prevState: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  const input = parseCreateInput(formData) as UpdateProjectInput;

  try {
    await projectService.updateProject(org.organizationId, user.id, projectId, input);
  } catch (error) {
    const submittedValues = extractSubmittedValues(formData);
    if (error instanceof z.ZodError) {
      return { fieldErrors: zodFieldErrors(error), submittedValues };
    }
    if (error instanceof NotFoundError) {
      return { formError: 'Project not found.', submittedValues };
    }
    if (error instanceof BusinessRuleError) {
      return { formError: error.message, submittedValues };
    }
    return { formError: 'Could not update the project. Please try again.', submittedValues };
  }

  revalidateProjectViews(projectId);
  redirect(`/projects/${projectId}`);
}

export async function updateProjectStatusAction(
  projectId: string,
  status: string,
  options?: { blockedReason?: string; reason?: string },
): Promise<ProjectActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  try {
    await projectService.updateProjectStatus(org.organizationId, user.id, {
      projectId,
      status: status as never,
      blockedReason: options?.blockedReason,
      reason: options?.reason,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { fieldErrors: zodFieldErrors(error) };
    }
    if (error instanceof NotFoundError) {
      return { formError: 'Project not found.' };
    }
    return { formError: 'Could not update status. Please try again.' };
  }

  revalidateProjectViews(projectId);
  return { success: true };
}

export async function updateProjectFocusLevelAction(
  projectId: string,
  focusLevel: number,
  options?: { reason?: string; overrideCriticalLimit?: boolean; overrideReason?: string },
): Promise<ProjectActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  try {
    await projectService.updateProjectFocusLevel(org.organizationId, user.id, {
      projectId,
      focusLevel: focusLevel as never,
      reason: options?.reason,
      overrideCriticalLimit: options?.overrideCriticalLimit ?? false,
      overrideReason: options?.overrideReason,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { fieldErrors: zodFieldErrors(error) };
    }
    if (error instanceof NotFoundError) {
      return { formError: 'Project not found.' };
    }
    if (error instanceof BusinessRuleError && error.code === 'CRITICAL_LIMIT_EXCEEDED') {
      return { formError: error.message, requiresOverride: true };
    }
    if (error instanceof BusinessRuleError) {
      return { formError: error.message };
    }
    return { formError: 'Could not update focus level. Please try again.' };
  }

  revalidateProjectViews(projectId);
  return { success: true };
}

export async function archiveOrParkProjectAction(
  projectId: string,
  action: 'archive' | 'park',
  reason?: string,
): Promise<ProjectActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  try {
    await projectService.archiveOrParkProject(org.organizationId, user.id, { projectId, action, reason });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { fieldErrors: zodFieldErrors(error) };
    }
    if (error instanceof NotFoundError) {
      return { formError: 'Project not found.' };
    }
    return { formError: `Could not ${action} the project. Please try again.` };
  }

  revalidateProjectViews(action === 'park' ? projectId : undefined);
  revalidatePath('/projects');
  return { success: true };
}

export async function addProjectDependencyAction(
  projectId: string,
  dependsOnProjectId: string,
  dependencyType: string,
  note?: string,
): Promise<ProjectActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  try {
    await projectService.addProjectDependency(org.organizationId, user.id, {
      projectId,
      dependsOnProjectId,
      dependencyType: dependencyType as never,
      note,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { fieldErrors: zodFieldErrors(error) };
    }
    if (error instanceof NotFoundError) {
      return { formError: 'Project not found.' };
    }
    if (error instanceof BusinessRuleError) {
      return { formError: error.message };
    }
    return { formError: 'Could not add the dependency. Please try again.' };
  }

  revalidateProjectViews(projectId);
  return { success: true };
}

export async function removeProjectDependencyAction(projectId: string, dependencyId: string): Promise<ProjectActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  try {
    await projectService.removeProjectDependency(org.organizationId, user.id, { projectId, dependencyId });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { formError: 'Dependency not found.' };
    }
    return { formError: 'Could not remove the dependency. Please try again.' };
  }

  revalidateProjectViews(projectId);
  return { success: true };
}
