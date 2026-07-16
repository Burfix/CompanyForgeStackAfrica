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
};
