import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';
import type { TablesInsert, TablesUpdate, Enums } from '@/types/database.types';
import type { ProjectSortOption } from '@/features/projects/constants';

export interface ProjectListFilters {
  search?: string;
  focusLevel?: number;
  status?: Enums<'project_status'>;
  category?: string;
  sort?: ProjectSortOption;
  sortDirection?: 'asc' | 'desc';
}

const PROJECT_LIST_COLUMNS =
  'id, name, category, status, focus_level, health, health_note, target_date, start_date, next_review_at, review_cadence, owner_id, priority_score, priority_level, progress_percent, attention_mode, business_impact, desired_outcome, founder_attention_required, last_activity_at, slug, owner:profiles!projects_owner_id_fkey(id, full_name)';

/**
 * Every physical, mutable column on `projects` — the single canonical
 * projection for anything that diffs a patch against "the current row".
 * Centralised here (rather than assembled ad hoc per call site) so that a
 * new mutable column added to the schema only needs to be added in ONE
 * place to keep no-op detection correct; see
 * lib/diff-patch.ts and services/project.service.ts.
 *
 * Deliberately does NOT include the `owner` relation join — mutation
 * diffing only ever needs scalar columns, and pulling in a relation here
 * would be a wasted join on every write path.
 */
const PROJECT_MUTATION_COLUMNS =
  'id, organization_id, name, slug, category, description, owner_id, status, focus_level, desired_outcome, success_metric, target_value, current_value, target_outcome, start_date, target_date, due_date, next_review_at, review_cadence, blocked_reason, waiting_on, attention_mode, founder_attention_required, priority_level, priority_score, health, health_note, business_impact, progress_mode, progress_percent, archived_at, created_by, created_at, updated_at, last_activity_at';

export const projectsRepository = {
  /** Full portfolio view with search/filter/sort — powers /projects. */
  async listProjects(organizationId: string, filters: ProjectListFilters = {}) {
    const supabase = await createClient();
    let query = supabase
      .from('projects')
      .select(PROJECT_LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .is('archived_at', null);

    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }
    if (filters.focusLevel) {
      query = query.eq('focus_level', filters.focusLevel);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    const sortColumn = filters.sort ?? 'priority_score';
    const ascending = filters.sortDirection === 'asc';
    query = query.order(sortColumn, { ascending, nullsFirst: false });

    const { data, error } = await query;
    if (error) throw toOperationalError(error, 'Could not load projects.');
    return data;
  },

  /** Legacy alias kept for Founder HQ, which doesn't need filtering. */
  async listByOrg(organizationId: string) {
    return this.listProjects(organizationId, { sort: 'priority_score' });
  },

  async getById(organizationId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('projects')
      .select('*, owner:profiles!projects_owner_id_fkey(id, full_name, avatar_url)')
      .eq('organization_id', organizationId)
      .eq('id', projectId)
      .is('archived_at', null)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not load project.');
    return data;
  },

  /**
   * True project-level access check, independent of any list query. Used
   * by every mutation before it touches a project — RLS already prevents
   * cross-org rows from ever being returned, but this gives mutations an
   * explicit, auditable "not found or not yours" checkpoint rather than
   * relying implicitly on RLS silently returning zero rows.
   */
  async verifyProjectAccess(organizationId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('projects')
      .select('id, organization_id, name, status, focus_level, progress_mode, progress_percent')
      .eq('organization_id', organizationId)
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not verify project access.');
    return data;
  },

  /**
   * Canonical full-row read for mutation comparisons. Every service method
   * that computes a patch and diffs it against "the existing row" (see
   * lib/diff-patch.ts) MUST load `existing` through this method, never
   * through verifyProjectAccess's slim projection — a field omitted from a
   * partial select reads back as `undefined`, and diffPatch would then
   * treat any submitted value for that field as "changed" even when it's
   * identical to what's already stored. Org- and id-scoped, same "not
   * found or not yours" shape as verifyProjectAccess (returns null rather
   * than throwing on a missing/foreign row — the caller decides whether
   * that's a NotFoundError).
   */
  async getProjectForMutation(organizationId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_MUTATION_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not load project.');
    return data;
  },

  async create(input: TablesInsert<'projects'>) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('projects').insert(input).select().single();

    if (error) throw toOperationalError(error, 'Could not create project.');
    return data;
  },

  async update(organizationId: string, projectId: string, patch: TablesUpdate<'projects'>) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('projects')
      .update(patch)
      .eq('organization_id', organizationId)
      .eq('id', projectId)
      .select()
      .single();

    if (error) throw toOperationalError(error, 'Could not update project.');
    return data;
  },

  /** Powers the Critical-project-limit check before allowing a 4th. */
  async countCriticalProjects(organizationId: string, excludeProjectId?: string) {
    const supabase = await createClient();
    let query = supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('focus_level', 1)
      .is('archived_at', null);

    if (excludeProjectId) {
      query = query.neq('id', excludeProjectId);
    }

    const { count, error } = await query;
    if (error) throw toOperationalError(error, 'Could not check Critical project count.');
    return count ?? 0;
  },

  /** Counts by status — powers the Founder HQ company-health summary. */
  async countByStatus(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('projects')
      .select('status')
      .eq('organization_id', organizationId)
      .is('archived_at', null);

    if (error) throw toOperationalError(error, 'Could not load project counts.');

    return data.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
  },

  /** Distinct categories in use — powers the category filter dropdown. */
  async listCategories(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('projects')
      .select('category')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .not('category', 'is', null);

    if (error) throw toOperationalError(error, 'Could not load categories.');
    return Array.from(new Set(data.map((row) => row.category).filter((c): c is string => !!c))).sort();
  },

  async slugExists(organizationId: string, slug: string, excludeProjectId?: string) {
    const supabase = await createClient();
    let query = supabase.from('projects').select('id').eq('organization_id', organizationId).eq('slug', slug);
    if (excludeProjectId) {
      query = query.neq('id', excludeProjectId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw toOperationalError(error, 'Could not check slug uniqueness.');
    return !!data;
  },

  /** Lightweight rows for populating "depends on" pickers — deliberately
   * excludes the target project itself and archived projects. */
  async listSelectable(organizationId: string, excludeProjectId?: string) {
    const supabase = await createClient();
    let query = supabase
      .from('projects')
      .select('id, name')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .order('name', { ascending: true });
    if (excludeProjectId) {
      query = query.neq('id', excludeProjectId);
    }
    const { data, error } = await query;
    if (error) throw toOperationalError(error, 'Could not load projects for dependency selection.');
    return data;
  },

  /** Founder HQ intelligence: at-risk/off-track and founder-required rows,
   * ordered so the most urgent (by priority_level, then next_review_at)
   * surface first. Reuses listProjects rather than a bespoke query. */
  async listNeedingAttention(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_LIST_COLUMNS)
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .or('health.eq.at_risk,health.eq.off_track,attention_mode.eq.founder')
      .order('next_review_at', { ascending: true, nullsFirst: false });

    if (error) throw toOperationalError(error, 'Could not load projects needing attention.');
    return data;
  },
};
