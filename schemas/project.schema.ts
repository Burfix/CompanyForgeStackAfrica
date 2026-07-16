import { z } from 'zod';

export const projectStatusSchema = z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']);
export const projectHealthSchema = z.enum(['on_track', 'at_risk', 'off_track']);

/** Single validation boundary for creating a project — shared by the Server Action and the client form. */
export const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(60).optional(),
  ownerId: z.string().uuid().optional(),
  status: projectStatusSchema.default('planning'),
  focusLevel: z.number().int().min(1).max(5).default(3),
  targetOutcome: z.string().trim().max(500).optional(),
  dueDate: z.string().date().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
