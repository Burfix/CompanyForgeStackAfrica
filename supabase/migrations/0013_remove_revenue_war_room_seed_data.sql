-- 0013_remove_revenue_war_room_seed_data.sql
-- Remove initial example pipeline rows from the Founder OS Revenue War Room.
--
-- The War Room should start from real founder-entered opportunities, not
-- seeded examples. This deletes only rows that still match the original
-- seed signatures introduced by 0012, so user-edited deals are not removed.

delete from revenue_deals
where (account, deal_value, monthly_recurring_revenue, stage, probability, next_action, owner, next_action_date, expected_close_date, expected_payment_date, last_moved_date, coalesce(blocker, '')) in (
  ('Tourvest Hospitality Group', 24000, 12000, 'procurement', 0.70, 'Send final assurance pack and ask for payment date confirmation.', 'Thami', '2026-08-24'::date, '2026-09-05'::date, '2026-09-10'::date, '2026-08-20'::date, 'Enterprise assurance sign-off'),
  ('Sea Castle Hotel Camps Bay', 9000, 4500, 'proposal', 0.55, 'Run owner demo focused on housekeeping, maintenance and compliance controls.', 'Thami', '2026-08-25'::date, '2026-09-12'::date, '2026-09-16'::date, '2026-08-22'::date, ''),
  ('Primi Camps Bay', 7500, 3500, 'demo', 0.45, 'Book GM revenue recovery walkthrough and confirm decision maker.', 'Customer Development', '2026-08-24'::date, '2026-09-18'::date, '2026-09-20'::date, '2026-08-21'::date, ''),
  ('Si Cantina Sociale', 6000, 3000, 'proposal', 0.50, 'Convert pilot ROI into two-line commercial offer for September.', 'EA', '2026-08-24'::date, '2026-09-15'::date, '2026-09-18'::date, '2026-08-19'::date, ''),
  ('Airport Precinct Operator', 18000, 8000, 'discovery', 0.25, 'Qualify enterprise operations pain and identify procurement path.', 'Customer Development', '2026-08-26'::date, '2026-09-25'::date, '2026-09-30'::date, '2026-08-18'::date, 'Decision-maker access'),
  ('Shopping Centre Operations Pilot', 12000, 6000, 'lead', 0.20, 'Draft precinct command-center use case and request intro.', 'Cybersecurity', '2026-08-27'::date, '2026-09-28'::date, '2026-09-30'::date, '2026-08-20'::date, 'Enterprise assurance narrative')
);
