'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser, getCurrentOrg } from '@/lib/auth/session';
import { taskService } from '@/services/task.service';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { CreateTaskInput, UpdateTaskInput } from '@/schemas/task.schema';

export interface TaskActionState {
  formError?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
  /**
   * Raw echo of whatever was submitted, keyed by form field name. Populated
   * only on a failed create/update submission so TaskForm can re-seed every
   * field with what the user actually typed instead of resetting to blank.
   * Mirrors the identical fix in features/projects/actions.ts.
   */
  submittedValues?: Record<string, string | string[]>;
}

function extractSubmittedValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of formData.keys()) {
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

function revalidateTaskViews(taskId?: string, projectId?: string) {
  revalidatePath('/');
  revalidatePath('/tasks');
  if (taskId) revalidatePath(`/tasks/${taskId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

function parseCreateInput(formData: FormData): CreateTaskInput {
  return {
    title: String(formData.get('title') ?? ''),
    projectId: String(formData.get('projectId') ?? ''),
    description: (formData.get('description') as string) || undefined,
    ownerId: (formData.get('ownerId') as string) || undefined,
    milestoneId: (formData.get('milestoneId') as string) || undefined,
    status: (formData.get('status') as CreateTaskInput['status']) || 'inbox',
    priority: (formData.get('priority') as CreateTaskInput['priority']) || 'medium',
    attentionMode: (formData.get('attentionMode') as CreateTaskInput['attentionMode']) || 'no_attention',
    dueAt: (formData.get('dueAt') as string) || undefined,
    startAt: (formData.get('startAt') as string) || undefined,
    estimatedMinutes: (formData.get('estimatedMinutes') as string) || undefined,
    actualMinutes: (formData.get('actualMinutes') as string) || undefined,
    blockedReason: (formData.get('blockedReason') as string) || undefined,
    waitingOn: (formData.get('waitingOn') as string) || undefined,
    nextAction: (formData.get('nextAction') as string) || undefined,
    sourceType: (formData.get('sourceType') as CreateTaskInput['sourceType']) || 'manual',
    sourceReference: (formData.get('sourceReference') as string) || undefined,
  } as CreateTaskInput;
}

export async function createTaskAction(_prevState: TaskActionState, formData: FormData): Promise<TaskActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let task;
  try {
    task = await taskService.createTask(org.organizationId, user.id, parseCreateInput(formData));
  } catch (error) {
    const submittedValues = extractSubmittedValues(formData);
    if (error instanceof z.ZodError) return { fieldErrors: zodFieldErrors(error), submittedValues };
    if (error instanceof BusinessRuleError) return { formError: error.message, submittedValues };
    return { formError: 'Could not create the task. Please try again.', submittedValues };
  }

  revalidateTaskViews(task.id, task.project_id);
  const returnTo = formData.get('returnTo');
  redirect(typeof returnTo === 'string' && returnTo ? returnTo : `/tasks/${task.id}`);
}

export async function updateTaskAction(taskId: string, _prevState: TaskActionState, formData: FormData): Promise<TaskActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  const input = parseCreateInput(formData) as UpdateTaskInput;
  let updated;
  try {
    updated = await taskService.updateTask(org.organizationId, user.id, taskId, input);
  } catch (error) {
    const submittedValues = extractSubmittedValues(formData);
    if (error instanceof z.ZodError) return { fieldErrors: zodFieldErrors(error), submittedValues };
    if (error instanceof NotFoundError) return { formError: 'Task not found.', submittedValues };
    if (error instanceof BusinessRuleError) return { formError: error.message, submittedValues };
    return { formError: 'Could not update the task. Please try again.', submittedValues };
  }

  revalidateTaskViews(taskId, updated.project_id);
  redirect(`/tasks/${taskId}`);
}

export async function updateTaskStatusAction(
  taskId: string,
  status: string,
  options?: { blockedReason?: string; waitingOn?: string; reason?: string },
): Promise<TaskActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let updated;
  try {
    updated = await taskService.updateTaskStatus(org.organizationId, user.id, {
      taskId,
      status: status as never,
      blockedReason: options?.blockedReason,
      waitingOn: options?.waitingOn,
      reason: options?.reason,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { fieldErrors: zodFieldErrors(error) };
    if (error instanceof NotFoundError) return { formError: 'Task not found.' };
    if (error instanceof BusinessRuleError) return { formError: error.message };
    return { formError: 'Could not update status. Please try again.' };
  }

  revalidateTaskViews(taskId, updated.project_id);
  return { success: true };
}

export async function updateTaskPriorityAction(taskId: string, priority: string, reason?: string): Promise<TaskActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let updated;
  try {
    updated = await taskService.updateTaskPriority(org.organizationId, user.id, { taskId, priority: priority as never, reason });
  } catch (error) {
    if (error instanceof NotFoundError) return { formError: 'Task not found.' };
    return { formError: 'Could not update priority. Please try again.' };
  }

  revalidateTaskViews(taskId, updated.project_id);
  return { success: true };
}

export async function assignTaskAction(taskId: string, ownerId: string | null): Promise<TaskActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let updated;
  try {
    updated = await taskService.assignTask(org.organizationId, user.id, { taskId, ownerId });
  } catch (error) {
    if (error instanceof NotFoundError) return { formError: 'Task not found.' };
    if (error instanceof BusinessRuleError) return { formError: error.message };
    return { formError: 'Could not assign the task. Please try again.' };
  }

  revalidateTaskViews(taskId, updated.project_id);
  return { success: true };
}

export async function completeTaskAction(taskId: string, actualMinutes?: number): Promise<TaskActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let updated;
  try {
    updated = await taskService.completeTask(org.organizationId, user.id, { taskId, actualMinutes });
  } catch (error) {
    if (error instanceof NotFoundError) return { formError: 'Task not found.' };
    return { formError: 'Could not complete the task. Please try again.' };
  }

  revalidateTaskViews(taskId, updated.project_id);
  return { success: true };
}

export async function reopenTaskAction(taskId: string, targetStatus: 'planned' | 'in_progress', reason?: string): Promise<TaskActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let updated;
  try {
    updated = await taskService.reopenTask(org.organizationId, user.id, { taskId, targetStatus, reason });
  } catch (error) {
    if (error instanceof NotFoundError) return { formError: 'Task not found.' };
    if (error instanceof BusinessRuleError) return { formError: error.message };
    return { formError: 'Could not reopen the task. Please try again.' };
  }

  revalidateTaskViews(taskId, updated.project_id);
  return { success: true };
}

export async function cancelTaskAction(taskId: string, reason?: string): Promise<TaskActionState> {
  const user = await requireUser();
  const org = await getCurrentOrg();

  let updated;
  try {
    updated = await taskService.cancelTask(org.organizationId, user.id, { taskId, reason });
  } catch (error) {
    if (error instanceof NotFoundError) return { formError: 'Task not found.' };
    return { formError: 'Could not cancel the task. Please try again.' };
  }

  revalidateTaskViews(taskId, updated.project_id);
  return { success: true };
}
