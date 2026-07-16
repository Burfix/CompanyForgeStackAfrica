import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database.types';

/**
 * project_dependencies is a proper relational table (see migration 0006),
 * not project IDs embedded in JSON. Self-reference and cross-org edges are
 * rejected by a DB trigger as a backstop; duplicate edges are rejected by a
 * unique index. This repository never tries to work around either — a
 * violation surfaces as a normal OperationalError.
 */
export const projectDependenciesRepository = {
  /** Both directions — what this project depends on, and what depends on it. */
  async listForProject(organizationId: string, projectId: string) {
    const supabase = await createClient();

    const [outgoing, incoming] = await Promise.all([
      supabase
        .from('project_dependencies')
        .select('id, dependency_type, note, created_at, depends_on_project_id, depends_on:projects!project_dependencies_depends_on_project_id_fkey(id, name, status, health)')
        .eq('organization_id', organizationId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_dependencies')
        .select('id, dependency_type, note, created_at, project_id, dependent:projects!project_dependencies_project_id_fkey(id, name, status, health)')
        .eq('organization_id', organizationId)
        .eq('depends_on_project_id', projectId)
        .order('created_at', { ascending: false }),
    ]);

    if (outgoing.error) throw toOperationalError(outgoing.error, 'Could not load project dependencies.');
    if (incoming.error) throw toOperationalError(incoming.error, 'Could not load projects that depend on this one.');

    return { outgoing: outgoing.data, incoming: incoming.data };
  },

  /** Count only — used to render "N dependencies" on the portfolio card
   * without pulling full rows for every card. */
  async countForProjects(organizationId: string, projectIds: string[]) {
    if (projectIds.length === 0) return new Map<string, number>();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('project_dependencies')
      .select('project_id')
      .eq('organization_id', organizationId)
      .in('project_id', projectIds);

    if (error) throw toOperationalError(error, 'Could not load dependency counts.');

    const counts = new Map<string, number>();
    for (const row of data) {
      counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
    }
    return counts;
  },

  async exists(organizationId: string, projectId: string, dependsOnProjectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('project_dependencies')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .eq('depends_on_project_id', dependsOnProjectId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not check for an existing dependency.');
    return !!data;
  },

  async create(input: TablesInsert<'project_dependencies'>) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('project_dependencies').insert(input).select().single();
    if (error) throw toOperationalError(error, 'Could not create the dependency.');
    return data;
  },

  /** Scoped by organization_id + project_id so a dependency can only be
   * removed via the project it was attached from within the caller's org —
   * never a bare id lookup. */
  async remove(organizationId: string, projectId: string, dependencyId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('project_dependencies')
      .delete()
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .eq('id', dependencyId)
      .select()
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not remove the dependency.');
    return data;
  },
};
