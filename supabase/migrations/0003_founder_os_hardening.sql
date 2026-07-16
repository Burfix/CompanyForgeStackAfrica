-- 0003_founder_os_hardening.sql
-- Fixes flagged by the Supabase security advisor after 0001/0002.

-- Pin search_path on trigger functions so they can't be hijacked by a role
-- that manipulates search_path ahead of the call.
alter function set_updated_at() set search_path = '';
alter function handle_new_auth_user() set search_path = public;

-- handle_new_auth_user is a trigger function only — no client role should
-- ever call it directly via RPC.
revoke execute on function handle_new_auth_user() from public;
revoke execute on function handle_new_auth_user() from anon;
revoke execute on function handle_new_auth_user() from authenticated;
