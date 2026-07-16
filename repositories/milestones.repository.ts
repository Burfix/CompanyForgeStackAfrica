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

  /** Milestones for a set of projects, grouped by project — powers the
   * task form's project → milestone dependent select without an N+1 query
   * per project. */
  async listForProjects(organizationId: string, projectIds: string[]) {
    if (projectIds.length === 0) return new Map<string, { id: string; title: string }[]>();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('id, title, project_id')
      .eq('organization_id', organizationId)
      .in('project_id', projectIds)
      .order('sort_order', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load milestones.');

    const byProject = new Map<string, { id: string; title: string }[]>();
    for (const m of data) {
      const list = byProject.get(m.project_id) ?? [];
      list.push({ id: m.id, title: m.title });
      byProject.set(m.project_id, list);
    }
    return byProject;
  },

  /** Used by task creation/update to enforce "milestone must belong to the
   * selected project" — never trust a client-supplied milestone_id without
   * this check. */
  async verifyMilestoneBelongsToProject(organizationId: string, milestoneId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('milestones')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', milestoneId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not verify milestone.');
    return !!data;
  },
};
