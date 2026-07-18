'use client';

import { useActionState, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { PLATFORM_COST_CATEGORY_VALUES, PLATFORM_COST_BILLING_FREQUENCY_VALUES } from '@/schemas/platform-cost.schema';
import { PLATFORM_COST_CATEGORY_META, PLATFORM_COST_FREQUENCY_META } from '@/features/platform-costs/constants';
import { createPlatformCostAction, cancelPlatformCostAction, type PlatformCostActionState } from '@/features/platform-costs/actions';

const initialState: PlatformCostActionState = {};

interface PlatformCostRow {
  id: string;
  vendor: string;
  category: string;
  billing_frequency: string;
  amount: number;
  currency: string;
  notes: string | null;
}

interface BurnSummary {
  totalMonthly: number;
  byCategory: { category: string; monthlyAmount: number; lineItemCount: number }[];
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Founder-only cost tracking panel for /settings/platform-costs. Same
 * "small, owner/admin-only control, not a prominent product surface"
 * status as ReconciliationPanel/system-health — reached by direct URL
 * only, not in primary navigation.
 */
export function PlatformCostsPanel({ costs, summary }: { costs: PlatformCostRow[]; summary: BurnSummary }) {
  const [state, formAction, isPending] = useActionState(createPlatformCostAction, initialState);
  const [isCancelPending, startCancelTransition] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);

  function handleCancel(costId: string, vendor: string) {
    if (!window.confirm(`Mark "${vendor}" as cancelled? It stays in history but drops out of the monthly total.`)) return;
    setCancelError(null);
    startCancelTransition(async () => {
      const result = await cancelPlatformCostAction(costId);
      if (result.formError) setCancelError(result.formError);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border p-4">
        <p className="text-xs text-muted-foreground">True Monthly Burn (all-in, annual costs amortized)</p>
        <p className="text-2xl font-semibold text-foreground">{formatMoney(summary.totalMonthly, 'USD')}</p>
        {summary.byCategory.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
            {summary.byCategory.map((row) => (
              <li key={row.category} className="flex justify-between">
                <span>{PLATFORM_COST_CATEGORY_META[row.category as keyof typeof PLATFORM_COST_CATEGORY_META]?.label ?? row.category}</span>
                <span>
                  {formatMoney(row.monthlyAmount, 'USD')} ({row.lineItemCount})
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <p className="text-sm font-medium text-foreground">Add a cost</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="vendor" className="text-xs text-muted-foreground">Vendor</label>
            <input
              id="vendor"
              name="vendor"
              defaultValue={(state.submittedValues?.vendor as string) ?? ''}
              className="h-8 w-48 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="text-xs text-muted-foreground">Category</label>
            <select
              id="category"
              name="category"
              defaultValue={(state.submittedValues?.category as string) ?? 'infra'}
              className="h-8 w-40 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
            >
              {PLATFORM_COST_CATEGORY_VALUES.map((value) => (
                <option key={value} value={value}>
                  {PLATFORM_COST_CATEGORY_META[value].label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="amount" className="text-xs text-muted-foreground">Amount</label>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={(state.submittedValues?.amount as string) ?? ''}
              className="h-8 w-28 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="currency" className="text-xs text-muted-foreground">Currency</label>
            <input
              id="currency"
              name="currency"
              defaultValue={(state.submittedValues?.currency as string) ?? 'USD'}
              className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
              maxLength={3}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="billingFrequency" className="text-xs text-muted-foreground">Billing</label>
            <select
              id="billingFrequency"
              name="billingFrequency"
              defaultValue={(state.submittedValues?.billingFrequency as string) ?? 'monthly'}
              className="h-8 w-28 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
            >
              {PLATFORM_COST_BILLING_FREQUENCY_VALUES.map((value) => (
                <option key={value} value={value}>
                  {PLATFORM_COST_FREQUENCY_META[value].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-xs text-muted-foreground">Notes (optional)</label>
          <input
            id="notes"
            name="notes"
            defaultValue={(state.submittedValues?.notes as string) ?? ''}
            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
          />
        </div>
        <div>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Adding…' : 'Add cost'}
          </Button>
        </div>
        {state.formError ? <p className="text-xs text-destructive">{state.formError}</p> : null}
        {state.fieldErrors ? (
          <ul className="text-xs text-destructive">
            {Object.entries(state.fieldErrors).map(([field, messages]) => (
              <li key={field}>{messages.join(' ')}</li>
            ))}
          </ul>
        ) : null}
        {state.success ? <p className="text-xs text-emerald-600">Cost added.</p> : null}
      </form>

      <div className="rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-2 font-medium">Vendor</th>
              <th className="p-2 font-medium">Category</th>
              <th className="p-2 font-medium">Amount</th>
              <th className="p-2 font-medium">Billing</th>
              <th className="p-2 font-medium">Notes</th>
              <th className="p-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {costs.map((cost) => (
              <tr key={cost.id} className="border-b border-border last:border-0">
                <td className="p-2 text-foreground">{cost.vendor}</td>
                <td className="p-2 text-muted-foreground">
                  {PLATFORM_COST_CATEGORY_META[cost.category as keyof typeof PLATFORM_COST_CATEGORY_META]?.label ?? cost.category}
                </td>
                <td className="p-2 text-foreground">{formatMoney(cost.amount, cost.currency)}</td>
                <td className="p-2 text-muted-foreground">
                  {PLATFORM_COST_FREQUENCY_META[cost.billing_frequency as keyof typeof PLATFORM_COST_FREQUENCY_META]?.label ?? cost.billing_frequency}
                </td>
                <td className="p-2 text-muted-foreground">{cost.notes ?? '—'}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="ghost" disabled={isCancelPending} onClick={() => handleCancel(cost.id, cost.vendor)}>
                    Cancel
                  </Button>
                </td>
              </tr>
            ))}
            {costs.length === 0 ? (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={6}>
                  No costs recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {cancelError ? <p className="text-xs text-destructive">{cancelError}</p> : null}
    </div>
  );
}
