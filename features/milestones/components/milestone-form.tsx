'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MILESTONE_STATUS_META,
  MILESTONE_HEALTH_META,
  MILESTONE_PRIORITY_META,
  MILESTONE_PROGRESS_MODE_META,
  ATTENTION_MODE_META,
} from '@/features/milestones/constants';
import type { MilestoneActionState } from '@/features/milestones/actions';

export interface MilestoneFormValues {
  title?: string;
  projectId?: string;
  description?: string | null;
  successCriteria?: string | null;
  ownerId?: string | null;
  status?: string;
  priority?: string;
  health?: string;
  healthNote?: string | null;
  attentionMode?: string;
  progressMode?: string;
  progressPercent?: number | null;
  targetValue?: string | null;
  currentValue?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  nextReviewAt?: string | null;
  blockedReason?: string | null;
  waitingOn?: string | null;
}

interface MilestoneFormProps {
  action: (state: MilestoneActionState, formData: FormData) => Promise<MilestoneActionState>;
  initialValues?: MilestoneFormValues;
  members: { id: string; full_name: string | null }[];
  projects: { id: string; name: string }[];
  submitLabel: string;
  lockProject?: boolean;
  returnTo?: string;
}

const initialState: MilestoneActionState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

function HelperText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function MilestoneForm({ action, initialValues, members, projects, submitLabel, lockProject, returnTo }: MilestoneFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  // Prefer what the user actually typed (echoed back on a failed
  // submission via submittedValues) over initialValues — mirrors the
  // identical fix in ProjectForm/TaskForm (see those files for the
  // original bug this pattern fixes: a validation error must never cost
  // someone their work).
  const submitted = state.submittedValues;
  const values: MilestoneFormValues = submitted
    ? {
        ...initialValues,
        title: (submitted.title as string) ?? initialValues?.title,
        projectId: (submitted.projectId as string) ?? initialValues?.projectId,
        description: (submitted.description as string) || initialValues?.description,
        successCriteria: (submitted.successCriteria as string) || initialValues?.successCriteria,
        ownerId: (submitted.ownerId as string) || initialValues?.ownerId,
        status: (submitted.status as string) ?? initialValues?.status,
        priority: (submitted.priority as string) ?? initialValues?.priority,
        health: (submitted.health as string) ?? initialValues?.health,
        healthNote: (submitted.healthNote as string) || initialValues?.healthNote,
        attentionMode: (submitted.attentionMode as string) ?? initialValues?.attentionMode,
        progressMode: (submitted.progressMode as string) ?? initialValues?.progressMode,
        progressPercent: submitted.progressPercent ? Number(submitted.progressPercent) : initialValues?.progressPercent,
        targetValue: (submitted.targetValue as string) || initialValues?.targetValue,
        currentValue: (submitted.currentValue as string) || initialValues?.currentValue,
        startDate: (submitted.startDate as string) || initialValues?.startDate,
        dueDate: (submitted.dueDate as string) || initialValues?.dueDate,
        nextReviewAt: (submitted.nextReviewAt as string) || initialValues?.nextReviewAt,
        blockedReason: (submitted.blockedReason as string) || initialValues?.blockedReason,
        waitingOn: (submitted.waitingOn as string) || initialValues?.waitingOn,
      }
    : initialValues ?? {};

  const [projectId, setProjectId] = useState(values?.projectId ?? projects[0]?.id ?? '');
  const [status, setStatus] = useState(values?.status ?? 'pending');
  const [health, setHealth] = useState(values?.health ?? 'unknown');
  const [progressMode, setProgressMode] = useState(values?.progressMode ?? 'automatic');

  const fieldErrors = state.fieldErrors ?? {};
  const healthNoteRequired = health === 'at_risk' || health === 'off_track';
  const fieldErrorEntries = Object.entries(fieldErrors);
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
          <p className="font-medium">This milestone wasn&rsquo;t saved — {fieldErrorEntries.length === 1 ? 'a field needs' : `${fieldErrorEntries.length} fields need`} attention:</p>
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
                {Object.entries(MILESTONE_STATUS_META)
                  .filter(([value]) => value !== 'completed') // completion is a dedicated action, never set here
                  .map(([value, meta]) => (
                    <option key={value} value={value}>{meta.label}</option>
                  ))}
              </select>
              <FieldError errors={fieldErrors.status} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                name="priority"
                defaultValue={values?.priority ?? 'medium'}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                {Object.entries(MILESTONE_PRIORITY_META).map(([value, meta]) => (
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-foreground">Success Definition</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="successCriteria">Success criteria</Label>
            <HelperText>What must be true for this milestone to be considered achieved?</HelperText>
            <textarea
              id="successCriteria"
              name="successCriteria"
              defaultValue={values?.successCriteria ?? ''}
              rows={2}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currentValue">Current value</Label>
              <Input id="currentValue" name="currentValue" type="text" defaultValue={values?.currentValue ?? ''} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetValue">Target value</Label>
              <Input id="targetValue" name="targetValue" type="text" defaultValue={values?.targetValue ?? ''} />
            </div>
          </div>

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-foreground">Health</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="health">Health</Label>
            <select
              id="health"
              name="health"
              value={health}
              onChange={(e) => setHealth(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {Object.entries(MILESTONE_HEALTH_META).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
            <FieldError errors={fieldErrors.health} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="healthNote">
              Health note {healthNoteRequired ? '*' : <span className="font-normal text-muted-foreground">(recommended when Needs Attention)</span>}
            </Label>
            <Input id="healthNote" name="healthNote" defaultValue={values?.healthNote ?? ''} required={healthNoteRequired} />
            <FieldError errors={fieldErrors.healthNote} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-foreground">Progress</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="progressMode">Progress mode</Label>
            <select
              id="progressMode"
              name="progressMode"
              value={progressMode}
              onChange={(e) => setProgressMode(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {Object.entries(MILESTONE_PROGRESS_MODE_META).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
            <HelperText>{MILESTONE_PROGRESS_MODE_META[progressMode as 'automatic' | 'manual']?.description}</HelperText>
          </div>
          {progressMode === 'manual' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="progressPercent">Progress (%) *</Label>
              <Input id="progressPercent" name="progressPercent" type="number" min={0} max={100} step={1} defaultValue={values?.progressPercent ?? 0} required />
              <FieldError errors={fieldErrors.progressPercent} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Calculated automatically from this milestone&rsquo;s eligible tasks.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-foreground">Ownership and Attention</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ownerId">Executive Owner</Label>
            <select
              id="ownerId"
              name="ownerId"
              defaultValue={values?.ownerId ?? ''}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.full_name ?? member.id}</option>
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
        <CardHeader><CardTitle className="text-foreground">Timeline and Review</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" name="startDate" type="date" defaultValue={values?.startDate ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" name="dueDate" type="date" defaultValue={values?.dueDate ?? ''} />
            <FieldError errors={fieldErrors.dueDate} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nextReviewAt">Next review date</Label>
            <Input id="nextReviewAt" name="nextReviewAt" type="date" defaultValue={values?.nextReviewAt ? String(values.nextReviewAt).slice(0, 10) : ''} />
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
