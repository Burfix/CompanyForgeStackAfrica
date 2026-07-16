'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FOCUS_LEVEL_META,
  PROJECT_STATUS_META,
  CATEGORY_META,
  PRIORITY_LEVEL_META,
  HEALTH_META,
  REVIEW_CADENCE_META,
  ATTENTION_MODE_META,
  BUSINESS_IMPACT_META,
} from '@/features/projects/constants';
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
  reviewCadence?: string;
  blockedReason?: string | null;
  waitingOn?: string | null;
  attentionMode?: string;
  priorityLevel?: string;
  health?: string;
  healthNote?: string | null;
  businessImpact?: string[];
  progressPercent?: number;
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

function HelperText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function ProjectForm({ action, initialValues, members, submitLabel }: ProjectFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [status, setStatus] = useState(initialValues?.status ?? 'proposed');
  const [focusLevel, setFocusLevel] = useState(initialValues?.focusLevel ?? 3);
  const [health, setHealth] = useState(initialValues?.health ?? 'unknown');
  const [businessImpact, setBusinessImpact] = useState<string[]>(initialValues?.businessImpact ?? []);

  const fieldErrors = state.fieldErrors ?? {};
  const healthNoteRequired = health === 'at_risk' || health === 'off_track';

  function toggleImpact(value: string) {
    setBusinessImpact((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.formError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.formError}
        </div>
      ) : null}

      {/* 1. Overview */}
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
              <select
                id="category"
                name="category"
                defaultValue={initialValues?.category ?? ''}
                required
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                <option value="" disabled>Select a category</option>
                {Object.entries(CATEGORY_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
              <FieldError errors={fieldErrors.category} />
            </div>
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
                  {meta.display}
                </option>
              ))}
            </select>
            <HelperText>{FOCUS_LEVEL_META[focusLevel as 1 | 2 | 3 | 4 | 5]?.description}</HelperText>
            <FieldError errors={fieldErrors.focusLevel} />
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
        </CardContent>
      </Card>

      {/* 2. Success Definition */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Success Definition</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desiredOutcome">Desired outcome *</Label>
            <HelperText>What must be true for this project to be considered successful?</HelperText>
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
            <HelperText>How will success be measured?</HelperText>
            <Input
              id="successMetric"
              name="successMetric"
              placeholder="e.g. 2 paying locations, Signed pilot agreement"
              defaultValue={initialValues?.successMetric ?? ''}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currentValue">Current value</Label>
              <HelperText>Where are we today?</HelperText>
              <Input id="currentValue" name="currentValue" type="text" defaultValue={initialValues?.currentValue ?? ''} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetValue">Target value</Label>
              <HelperText>What result are we trying to reach?</HelperText>
              <Input id="targetValue" name="targetValue" type="text" defaultValue={initialValues?.targetValue ?? ''} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Priority and Health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Priority and Health</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priorityLevel">Priority</Label>
              <select
                id="priorityLevel"
                name="priorityLevel"
                defaultValue={initialValues?.priorityLevel ?? 'medium'}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                {Object.entries(PRIORITY_LEVEL_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
              <FieldError errors={fieldErrors.priorityLevel} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="health">Health</Label>
              <select
                id="health"
                name="health"
                value={health}
                onChange={(e) => setHealth(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                {Object.entries(HEALTH_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
              <FieldError errors={fieldErrors.health} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="healthNote">
              Health note {healthNoteRequired ? '*' : <span className="font-normal text-muted-foreground">(recommended when Needs Attention)</span>}
            </Label>
            <HelperText>A concise reason for the selected health, e.g. &ldquo;Waiting for integration credentials.&rdquo;</HelperText>
            <Input id="healthNote" name="healthNote" defaultValue={initialValues?.healthNote ?? ''} required={healthNoteRequired} />
            <FieldError errors={fieldErrors.healthNote} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="progressPercent">Progress (%)</Label>
            <HelperText>Manual for now — milestone-derived progress will override this in a future slice.</HelperText>
            <Input
              id="progressPercent"
              name="progressPercent"
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={initialValues?.progressPercent ?? 0}
            />
            <FieldError errors={fieldErrors.progressPercent} />
          </div>
        </CardContent>
      </Card>

      {/* 4. Business Impact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Business Impact</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <HelperText>Select every dimension this project materially affects.</HelperText>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(BUSINESS_IMPACT_META).map(([value, meta]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="businessImpact"
                  value={value}
                  checked={businessImpact.includes(value)}
                  onChange={() => toggleImpact(value)}
                  className="h-4 w-4"
                />
                {meta.label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 5. Timeline and Review */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Timeline and Review</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4">
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
              <Label htmlFor="nextReviewAt">Next review date</Label>
              <Input id="nextReviewAt" name="nextReviewAt" type="date" defaultValue={initialValues?.nextReviewAt ?? ''} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reviewCadence">Review cadence</Label>
            <select
              id="reviewCadence"
              name="reviewCadence"
              defaultValue={initialValues?.reviewCadence ?? 'none'}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {Object.entries(REVIEW_CADENCE_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* 6. Ownership and Attention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Ownership and Attention</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ownerId">Executive Owner</Label>
            <HelperText>Who owns this project. Must be a real member of the organisation.</HelperText>
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attentionMode">Attention Mode</Label>
            <HelperText>How the project should be handled right now — separate from who owns it.</HelperText>
            <select
              id="attentionMode"
              name="attentionMode"
              defaultValue={initialValues?.attentionMode ?? 'no_attention'}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {Object.entries(ATTENTION_MODE_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
            <FieldError errors={fieldErrors.attentionMode} />
          </div>
        </CardContent>
      </Card>

      {/* 7. Executive Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Executive Notes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <HelperText>Key context, assumptions or background an executive should understand. Do not place confidential credentials or secrets here.</HelperText>
          <textarea
            id="description"
            name="description"
            defaultValue={initialValues?.description ?? ''}
            rows={3}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
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
