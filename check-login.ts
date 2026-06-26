import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const passwords = ["1234", "123456", "112233", "12345678"];
  for (const p of passwords) {
    const { data, error } = await sb.auth.signInWithPassword({
      email: "itayk93@gmail.com",
      password: p,
    });
    if (!error) {
      console.log("SUCCESS WITH:", p);
      return;
    }
    console.log("FAILED WITH:", p, error.message);
  }
}
check();
