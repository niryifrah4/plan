import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://xpkjpfxyjeurcokunsnm.supabase.co', 'sb_publishable_7h5izIx7VCkzfbzQIj9bBg_msWehZrQ');
async function run() {
  const { data, error } = await sb.auth.signInWithPassword({
    email: 'niryifrah4@gmail.com',
    password: 'PlanAdvisor2026!'
  });
  console.log("Login result:", { data: data.user?.id, error });
}
run();
