import Link from 'next/link';
import { getCurrentOrg } from '@/lib/auth/session';
import { listBriefings } from '@/services/chief-of-staff.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_LABEL: Record<string, string> = {
  ready: 'AI-generated',
  fallback_ready: 'Deterministic (AI unavailable)',
  generating: 'Generating…',
  failed: 'Failed',
  superseded: 'Superseded',
};

export default async function ChiefOfStaffBriefingsPage() {
  const org = await getCurrentOrg();
  const briefings = await listBriefings(org.organizationId, 30);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Briefing History</h1>
        <p className="text-sm text-muted-foreground">Every Chief of Staff briefing ever generated for {org.organizationName}, most recent first.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Briefings</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {briefings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No briefings yet.</p>
          ) : (
            briefings.map((b) => {
              const generator = Array.isArray(b.generator) ? b.generator[0] : b.generator;
              return (
                <Link
                  key={b.id}
                  href={`/chief-of-staff/briefings/${b.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:border-primary/50"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{b.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.briefing_date} · {b.briefing_type} · {generator?.full_name ?? 'System'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{STATUS_LABEL[b.status] ?? b.status}</span>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
