import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';

export const milestonesRepository = {
  /** Upcoming, incomplete milestones across the org — powers Founder HQ. */
  async listUpcoming(organizationId: string, limit = 6) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('id, title, due_date, status, project_id, projects(name)')
      .eq('organization_id', organizationId)
      .in('status', ['pending', 'in_progress'])
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })
      .limit(limit);

    if (error) throw toOperationalError(error, 'Could not load milestones.');
    return data;
  },

  /** All milestones for a single project, in display order. */
  async listByProject(organizationId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('id, title, description, due_date, status, sort_order')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('due_date', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load project milestones.');
    return data;
  },

  /**
   * One "next milestone" per project, for the portfolio list view. Fetches
   * all open milestones for the given projects ordered by due date, then
   * reduces to the earliest per project client-side — Supabase's query
   * builder doesn't support DISTINCT ON, and this table will stay small
   * enough per-org that the extra rows are cheap.
   */
  async listNextForProjects(organizationId: string, projectIds: string[]) {
    if (projectIds.length === 0) return new Map<string, { id: string; title: string; due_date: string | null }>();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('id, title, due_date, project_id')
      .eq('organization_id', organizationId)
      .in('project_id', projectIds)
      .in('status', ['pending', 'in_progress'])
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load next milestones.');

    const nextByProject = new Map<string, { id: string; title: string; due_date: string | null }>();
    for (const milestone of data) {
      if (!nextByProject.has(milestone.project_id)) {
        nextByProject.set(milestone.project_id, milestone);
      }
    }
    return nextByProject;
  },
};
