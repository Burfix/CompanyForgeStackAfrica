'use client';

import { useActionState, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TASK_STATUS_META, TASK_PRIORITY_META, TASK_SOURCE_TYPE_META, ATTENTION_MODE_META } from '@/features/tasks/constants';
import type { TaskActionState } from '@/features/tasks/actions';

export interface TaskFormValues {
  title?: string;
  projectId?: string;
  description?: string | null;
  ownerId?: string | null;
  milestoneId?: string | null;
  status?: string;
  priority?: string;
  attentionMode?: string;
  dueAt?: string | null;
  startAt?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  blockedReason?: string | null;
  waitingOn?: string | null;
  nextAction?: string | null;
  sourceType?: string;
  sourceReference?: string | null;
}

interface TaskFormProps {
  action: (state: TaskActionState, formData: FormData) => Promise<TaskActionState>;
  initialValues?: TaskFormValues;
  members: { id: string; full_name: string | null }[];
  projects: { id: string; name: string; milestones: { id: string; title: string }[] }[];
  submitLabel: string;
  lockProject?: boolean;
  returnTo?: string;
}

const initialState: TaskActionState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

function toDatetimeLocal(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskForm({ action, initialValues, members, projects, submitLabel, lockProject, returnTo }: TaskFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  // Prefer what the user actually typed (echoed back on a failed
  // submission via submittedValues) over initialValues — mirrors the
  // identical fix in features/projects/components/project-form.tsx.
  const submitted = state.submittedValues;
  const values: TaskFormValues = submitted
    ? {
        ...initialValues,
        title: (submitted.title as string) ?? initialValues?.title,
        projectId: (submitted.projectId as string) ?? initialValues?.projectId,
        description: (submitted.description as string) || initialValues?.description,
        ownerId: (submitted.ownerId as string) || initialValues?.ownerId,
        milestoneId: (submitted.milestoneId as string) || initialValues?.milestoneId,
        status: (submitted.status as string) ?? initialValues?.status,
        priority: (submitted.priority as string) ?? initialValues?.priority,
        attentionMode: (submitted.attentionMode as string) ?? initialValues?.attentionMode,
        dueAt: (submitted.dueAt as string) || initialValues?.dueAt,
        startAt: (submitted.startAt as string) || initialValues?.startAt,
        estimatedMinutes: submitted.estimatedMinutes ? Number(submitted.estimatedMinutes) : initialValues?.estimatedMinutes,
        actualMinutes: submitted.actualMinutes ? Number(submitted.actualMinutes) : initialValues?.actualMinutes,
        blockedReason: (submitted.blockedReason as string) || initialValues?.blockedReason,
        waitingOn: (submitted.waitingOn as string) || initialValues?.waitingOn,
        nextAction: (submitted.nextAction as string) || initialValues?.nextAction,
        sourceType: (submitted.sourceType as string) ?? initialValues?.sourceType,
        sourceReference: (submitted.sourceReference as string) || initialValues?.sourceReference,
      }
    : initialValues ?? {};

  const [projectId, setProjectId] = useState(values?.projectId ?? projects[0]?.id ?? '');
  const [status, setStatus] = useState(values?.status ?? 'inbox');

  const fieldErrors = state.fieldErrors ?? {};
  const milestones = useMemo(() => projects.find((p) => p.id === projectId)?.milestones ?? [], [projects, projectId]);
  const fieldErrorEntries = Object.entries(fieldErrors);
  // See ProjectForm's identical formInstanceKey comment: forces uncontrolled
  // defaultValue-based inputs to re-apply the (possibly newly-merged)
  // `values` after a failed submission, without disturbing controlled state.
  const formInstanceKey = JSON.stringify({ e: state.fieldErrors ?? null, f: state.formError ?? null, v: state.submittedValues ?? null });

  return (
    <form key={formInstanceKey} action={formAction} className="flex flex-col gap-6">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {state.formError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.formError}
        </div>
      ) : null}

      {fieldErrorEntries.length > 0 ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p className="font-medium">This task wasn&rsquo;t saved — {fieldErrorEntries.length === 1 ? 'a field needs' : `${fieldErrorEntries.length} fields need`} attention:</p>
          <ul className="mt-1 list-disc pl-5">
            {fieldErrorEntries.map(([field, messages]) => (
              <li key={field}>{messages[0]}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-foreground">Overview</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" name="title" defaultValue={values?.title} required maxLength={200} />
            <FieldError errors={fieldErrors.title} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="projectId">Project *</Label>
              {lockProject ? (
                <>
                  <input type="hidden" name="projectId" value={projectId} />
                  <p className="flex h-9 items-center rounded-md border border-input bg-secondary px-3 text-sm text-foreground">
                    {projects.find((p) => p.id === projectId)?.name ?? 'Unknown project'}
                  </p>
                </>
              ) : (
                <select
                  id="projectId"
                  name="projectId"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  required
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
                >
                  <option value="" disabled>Select a project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              <FieldError errors={fieldErrors.projectId} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="milestoneId">Milestone</Label>
              <select
                id="milestoneId"
                name="milestoneId"
                defaultValue={values?.milestoneId ?? ''}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                <option value="">No milestone</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
              <FieldError errors={fieldErrors.milestoneId} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status *</Label>
              <select
                id="status"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                {Object.entries(TASK_STATUS_META).map(([value, meta]) => (
                  <option key={value} value={value}>{meta.label}</option>
                ))}
              </select>
              <FieldError errors={fieldErrors.status} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Priority *</Label>
              <select
                id="priority"
                name="priority"
                defaultValue={values?.priority ?? 'medium'}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                {Object.entries(TASK_PRIORITY_META).map(([value, meta]) => (
                  <option key={value} value={value}>{meta.label}</option>
                ))}
              </select>
              <FieldError errors={fieldErrors.priority} />
            </div>
          </div>

          {status === 'blocked' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="blockedReason">Blocked reason *</Label>
              <Input id="blockedReason" name="blockedReason" defaultValue={values?.blockedReason ?? ''} required />
              <FieldError errors={fieldErrors.blockedReason} />
            </div>
          ) : (
            <input type="hidden" name="blockedReason" value={values?.blockedReason ?? ''} />
          )}

          {status === 'waiting' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="waitingOn">Waiting on *</Label>
              <Input id="waitingOn" name="waitingOn" defaultValue={values?.waitingOn ?? ''} required />
              <FieldError errors={fieldErrors.waitingOn} />
            </div>
          ) : (
            <input type="hidden" name="waitingOn" value={values?.waitingOn ?? ''} />
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              defaultValue={values?.description ?? ''}
              rows={3}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nextAction">Next action</Label>
            <p className="text-xs text-muted-foreground">The single next concrete step to move this forward.</p>
            <Input id="nextAction" name="nextAction" defaultValue={values?.nextAction ?? ''} maxLength={300} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-foreground">Ownership and Attention</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ownerId">Owner</Label>
            <select
              id="ownerId"
              name="ownerId"
              defaultValue={values?.ownerId ?? ''}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name ?? m.id}</option>
              ))}
            </select>
            <FieldError errors={fieldErrors.ownerId} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attentionMode">Attention Mode</Label>
            <select
              id="attentionMode"
              name="attentionMode"
              defaultValue={values?.attentionMode ?? 'no_attention'}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {Object.entries(ATTENTION_MODE_META).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
            <FieldError errors={fieldErrors.attentionMode} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-foreground">Schedule and Effort</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startAt">Start date and time</Label>
              <Input id="startAt" name="startAt" type="datetime-local" defaultValue={toDatetimeLocal(values?.startAt)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dueAt">Due date and time</Label>
              <Input id="dueAt" name="dueAt" type="datetime-local" defaultValue={toDatetimeLocal(values?.dueAt)} />
              <FieldError errors={fieldErrors.dueAt} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="estimatedMinutes">Estimated minutes</Label>
              <Input id="estimatedMinutes" name="estimatedMinutes" type="number" min={1} step={1} defaultValue={values?.estimatedMinutes ?? ''} />
              <FieldError errors={fieldErrors.estimatedMinutes} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="actualMinutes">Actual minutes</Label>
              <Input id="actualMinutes" name="actualMinutes" type="number" min={0} step={1} defaultValue={values?.actualMinutes ?? ''} />
              <FieldError errors={fieldErrors.actualMinutes} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-foreground">Source</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sourceType">Source type</Label>
            <select
              id="sourceType"
              name="sourceType"
              defaultValue={values?.sourceType ?? 'manual'}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {Object.entries(TASK_SOURCE_TYPE_META).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sourceReference">Source reference</Label>
            <Input id="sourceReference" name="sourceReference" defaultValue={values?.sourceReference ?? ''} maxLength={300} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
