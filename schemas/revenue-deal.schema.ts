import { z } from 'zod';

export const DEAL_STAGE_VALUES = ['lead', 'discovery', 'demo', 'proposal', 'procurement', 'contracted', 'closed'] as const;
export const WORKFLOW_OWNER_VALUES = ['Thami', 'Customer Development', 'EA', 'Cybersecurity'] as const;

export const dealStageSchema = z.enum(DEAL_STAGE_VALUES);
export const workflowOwnerSchema = z.enum(WORKFLOW_OWNER_VALUES);

export type DealStage = z.infer<typeof dealStageSchema>;
export type WorkflowOwner = z.infer<typeof workflowOwnerSchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

export const revenueDealSchema = z
  .object({
    account: z.string().trim().min(2, 'Account must be at least 2 characters').max(160),
    dealValue: z.coerce.number().min(0, 'Deal value cannot be negative').max(99_999_999, 'Deal value is out of bounds'),
    monthlyRecurringRevenue: z.coerce.number().min(0, 'MRR cannot be negative').max(99_999_999, 'MRR is out of bounds'),
    stage: dealStageSchema,
    probability: z.coerce.number().min(0, 'Probability cannot be below 0').max(100, 'Probability cannot exceed 100'),
    nextAction: z.string().trim().min(2, 'Next action is required').max(500),
    owner: workflowOwnerSchema,
    nextActionDate: z.string().date(),
    expectedCloseDate: z.string().date(),
    expectedPaymentDate: z.string().date(),
    lastMovedDate: z.string().date(),
    blocker: optionalText(300),
  })
  .superRefine((data, ctx) => {
    if (data.expectedPaymentDate < data.expectedCloseDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedPaymentDate'],
        message: 'Expected payment date cannot be before expected close date.',
      });
    }
  });

export type RevenueDealInput = z.infer<typeof revenueDealSchema>;
