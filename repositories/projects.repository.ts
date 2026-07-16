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
  'id, name, category, status, focus_level, health, target_date, start_date, owner_id, priority_score, desired_outcome, founder_attention_required, last_activity_at, slug, owner:profiles!projects_owner_id_fkey(id, full_name)';

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
      .select('id, organization_id, name, status, focus_level')
      .eq('organization_id', organizationId)
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not verify project access.');
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
};
