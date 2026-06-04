# Supabase CLI Skill

When you need to connect to the Supabase CLI, link the project, or run Supabase CLI commands, follow these steps:

1. **Read Credentials**: Source or read the credentials from the `.env.supabase` file located at the root of the project.
2. **Login**: Use the `SUPABASE_ACCESS_TOKEN` to log in to the Supabase CLI without opening a browser:
   ```bash
   supabase login --token $SUPABASE_ACCESS_TOKEN
   ```
3. **Link Project**: Use the `SUPABASE_PROJECT_ID` and `SUPABASE_DB_PASSWORD` to link the local repository to the remote Supabase project:
   ```bash
   supabase link --project-ref $SUPABASE_PROJECT_ID -p $SUPABASE_DB_PASSWORD
   ```
4. **Execute Commands**: After linking, you can safely run commands like `supabase db push`, `supabase gen types typescript --linked > types/supabase.ts`, etc.
