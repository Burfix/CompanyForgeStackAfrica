'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FOCUS_LEVEL_META, PROJECT_STATUS_META } from '@/features/projects/constants';
import type { ProjectActionState } from '@/features/projects/actions';

export interface ProjectFormValues {
  name?: string;
  category?: string;
  description?: string | null;
  ownerId?: string | null;
  status?: string;
  focusLevel?: number;
  desiredOutcome?: string | null;
  successMetric?: string | null;
  targetValue?: number | null;
  currentValue?: number | null;
  startDate?: string | null;
  targetDate?: string | null;
  nextReviewAt?: string | null;
  blockedReason?: string | null;
  waitingOn?: string | null;
  founderAttentionRequired?: boolean;
}

interface ProjectFormProps {
  action: (state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  initialValues?: ProjectFormValues;
  members: { id: string; full_name: string | null }[];
  submitLabel: string;
}

const initialState: ProjectActionState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

export function ProjectForm({ action, initialValues, members, submitLabel }: ProjectFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [status, setStatus] = useState(initialValues?.status ?? 'proposed');
  const [focusLevel, setFocusLevel] = useState(initialValues?.focusLevel ?? 3);

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.formError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.formError}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" defaultValue={initialValues?.name} required maxLength={120} />
            <FieldError errors={fieldErrors.name} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category *</Label>
              <Input id="category" name="category" defaultValue={initialValues?.category} required maxLength={60} />
              <FieldError errors={fieldErrors.category} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ownerId">Owner</Label>
              <select
                id="ownerId"
                name="ownerId"
                defaultValue={initialValues?.ownerId ?? ''}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name ?? member.id}
                  </option>
                ))}
              </select>
              <FieldError errors={fieldErrors.ownerId} />
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
                {Object.entries(PROJECT_STATUS_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
              <FieldError errors={fieldErrors.status} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="focusLevel">Focus Level *</Label>
              <select
                id="focusLevel"
                name="focusLevel"
                value={focusLevel}
                onChange={(e) => setFocusLevel(Number(e.target.value))}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                {Object.entries(FOCUS_LEVEL_META).map(([level, meta]) => (
                  <option key={level} value={level}>
                    L{level} · {meta.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{FOCUS_LEVEL_META[focusLevel as 1 | 2 | 3 | 4 | 5]?.description}</p>
              <FieldError errors={fieldErrors.focusLevel} />
            </div>
          </div>

          {status === 'blocked' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="blockedReason">Blocked reason *</Label>
              <Input id="blockedReason" name="blockedReason" defaultValue={initialValues?.blockedReason ?? ''} required />
              <FieldError errors={fieldErrors.blockedReason} />
            </div>
          ) : (
            <input type="hidden" name="blockedReason" value={initialValues?.blockedReason ?? ''} />
          )}

          {focusLevel === 4 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="waitingOn">Waiting on <span className="font-normal text-muted-foreground">(recommended for Waiting projects)</span></Label>
              <Input id="waitingOn" name="waitingOn" defaultValue={initialValues?.waitingOn ?? ''} />
              <FieldError errors={fieldErrors.waitingOn} />
            </div>
          ) : (
            <input type="hidden" name="waitingOn" value={initialValues?.waitingOn ?? ''} />
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              defaultValue={initialValues?.description ?? ''}
              rows={3}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Outcome</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desiredOutcome">Desired outcome *</Label>
            <textarea
              id="desiredOutcome"
              name="desiredOutcome"
              defaultValue={initialValues?.desiredOutcome ?? ''}
              required
              rows={2}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground"
            />
            <FieldError errors={fieldErrors.desiredOutcome} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="successMetric">Success metric</Label>
            <Input id="successMetric" name="successMetric" defaultValue={initialValues?.successMetric ?? ''} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currentValue">Current value</Label>
              <Input id="currentValue" name="currentValue" type="number" step="any" defaultValue={initialValues?.currentValue ?? ''} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetValue">Target value</Label>
              <Input id="targetValue" name="targetValue" type="number" step="any" defaultValue={initialValues?.targetValue ?? ''} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" name="startDate" type="date" defaultValue={initialValues?.startDate ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="targetDate">Target date</Label>
            <Input id="targetDate" name="targetDate" type="date" defaultValue={initialValues?.targetDate ?? ''} />
            <FieldError errors={fieldErrors.targetDate} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nextReviewAt">Next review</Label>
            <Input id="nextReviewAt" name="nextReviewAt" type="date" defaultValue={initialValues?.nextReviewAt ?? ''} />
          </div>
        </CardContent>
      </Card>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="founderAttentionRequired" defaultChecked={initialValues?.founderAttentionRequired ?? false} className="h-4 w-4" />
        Requires founder attention right now
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
