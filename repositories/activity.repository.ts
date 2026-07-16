import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database.types';

export const activityRepository = {
  /** Most recent org-wide activity — powers Founder HQ and the /activity page. Paginated by occurred_at, never a full scan. */
  async listRecent(organizationId: string, limit = 20) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('activity_events')
      .select('id, event_type, entity_type, title, description, occurred_at, actor_id, profiles(full_name)')
      .eq('organization_id', organizationId)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (error) throw toOperationalError(error, 'Could not load activity.');
    return data;
  },

  /**
   * Writes an activity event. This should only ever be called from the
   * service layer as a side effect of a mutation — never directly from a
   * component or Server Action — so the audit trail can't be bypassed.
   */
  async record(event: TablesInsert<'activity_events'>) {
    const supabase = await createClient();
    const { error } = await supabase.from('activity_events').insert(event);

    if (error) throw toOperationalError(error, 'Could not record activity.');
  },
};
