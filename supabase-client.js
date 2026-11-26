// Public browser client. This publishable key is safe to expose; database access
// remains governed by the project's RLS policies and public views.
window.supabaseClient = window.supabase.createClient(
  'https://prlmvchedoxcnjyxabwm.supabase.co',
  'sb_publishable_wns1eyMguHlpW4dEcY3yFQ_mvPQYRZW'
);
