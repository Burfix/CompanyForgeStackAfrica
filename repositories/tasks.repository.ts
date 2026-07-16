import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';

export const tasksRepository = {
  /** Today's priorities widget on Founder HQ: open tasks due today or overdue, assigned to the current user. */
  async listTodaysPriorities(organizationId: string, userId: string) {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, priority, due_date, status, project_id, projects(name)')
      .eq('organization_id', organizationId)
      .eq('assignee_id', userId)
      .not('status', 'in', '(done,cancelled)')
      .lte('due_date', today)
      .order('due_date', { ascending: true });

    if (error) throw toOperationalError(error, 'Could not load tasks.');
    return data;
  },
};
