-- 0008_project_value_fields_to_text.sql
-- Project Intelligence (0006) required current_value/target_value to
-- support concise free text ("2 paying locations", "Signed pilot
-- agreement") — not just numbers. The columns were left as numeric(14,2)
-- from the original Slice 2 migration (0005), and the app-layer schema was
-- never updated to match, causing every text (non-numeric) submission to
-- fail Zod coercion with "Expected number, received nan". Confirmed via
-- query that all existing values (2 rows) are plain numeric strings
-- ("0.00", "18.00", "1.00", "3.00") that cast cleanly to text — this is
-- not a lossy conversion.

alter table projects alter column current_value type text using current_value::text;
alter table projects alter column target_value type text using target_value::text;
