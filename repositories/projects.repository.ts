import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database.types';

export const projectsRepository = {
  async listByOrg(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, category, status, focus_level, health, due_date, owner_id, priority_score')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .order('focus_level', { ascending: true })
      .order('priority_score', { ascending: false });

    if (error) throw toOperationalError(error, 'Could not load projects.');
    return data;
  },

  async getById(organizationId: string, projectId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', projectId)
      .single();

    if (error) throw toOperationalError(error, 'Could not load project.');
    return data;
  },

  async create(input: TablesInsert<'projects'>) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('projects').insert(input).select().single();

    if (error) throw toOperationalError(error, 'Could not create project.');
    return data;
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
};
