import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: { users }, error: usersError } = await sb.auth.admin.listUsers();
  if (usersError) throw usersError;
  
  users.sort((a, b) => {
    const timeA = Math.max(
      a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0,
      new Date(a.created_at).getTime()
    );
    const timeB = Math.max(
      b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0,
      new Date(b.created_at).getTime()
    );
    return timeB - timeA;
  });

  console.log("--- LAST 5 USERS ---");
  for (let i = 0; i < Math.min(5, users.length); i++) {
    const u = users[i];
    const { data: client } = await sb.from('client_users').select('*').eq('user_id', u.id).maybeSingle();
    const { data: advisor } = await sb.from('advisors').select('*').eq('id', u.id).maybeSingle();
    let role = "NONE (missing_role)";
    if (client) role = "Client";
    if (advisor) role = "Advisor";
    console.log(`${u.email} | ${u.id} | Role: ${role} | Last Sign In: ${u.last_sign_in_at} | Created: ${u.created_at}`);
  }
}

run().catch(console.error);
