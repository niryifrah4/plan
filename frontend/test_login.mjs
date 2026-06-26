import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://xpkjpfxyjeurcokunsnm.supabase.co";
const supabaseAnonKey = "sb_publishable_7h5izIx7VCkzfbzQIj9bBg_msWehZrQ";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin() {
  console.log("Attempting login...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "itayk93@gmail.com",
    password: "1234",
  });
  
  if (error) {
    console.error("Login Error:", error.name, error.message);
  } else {
    console.log("Login Success! User:", data.user?.email);
    console.log(data);
  }
}

testLogin();
