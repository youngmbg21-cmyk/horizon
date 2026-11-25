# Cloud Sync setup (Supabase Auth + RLS)

Horizon syncs your data across devices by storing it in **your own** Supabase
project, keyed to your signed-in account and fenced off by Row Level Security.
You sign in with an **email and password** — the same account on every device,
no codes to copy.

These are the one-time steps **you** do in the Supabase dashboard. Everything
else happens in the app.

---

## 1. Create a project

1. Go to **supabase.com** → sign up (free) → **New project**.
2. Pick a name and a strong database password (you won't need the password for
   the app). Wait ~1 minute for it to provision.

## 2. Enable email + password sign-in

1. In the dashboard: **Authentication → Providers → Email**.
2. Make sure **Email** is enabled.
3. Turn **OFF “Confirm email.”** This is the important one: with it off, you can
   create an account and sign in with just an email + password — **no
   confirmation email is ever sent**. (Leaving it on would email you a
   confirmation link on signup, which is the delivery step we're avoiding.)

> There's no redirect-URL step anymore. Password sign-in doesn't round-trip
> through your inbox, so nothing has to match a hosted URL.

## 3. Create the table + policy

**SQL Editor → New query**, paste this, and click **Run**:

```sql
-- One row of app state per user
create table if not exists app_state (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table app_state enable row level security;
create policy "own state" on app_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

That's the whole schema. It's one row per user; RLS makes sure a signed-in
account can only ever read or write its own row.

> **Note:** Uploaded bank statements are parsed into your state and the raw
> file is discarded — nothing is stored as a file — so there is **no Storage
> bucket to configure**. If file storage is added later, this doc will grow a
> Storage section.

## 4. Copy your keys into the app

1. In the dashboard: **Project Settings → API**.
2. Copy the **Project URL** (e.g. `https://abcd1234.supabase.co`) and the
   **anon public** key (a long `eyJ...` string — this one is safe to put in a
   client; the `service_role` key is **not** — never paste that anywhere).
3. In Horizon: **Settings → Cloud Sync**, paste both, click **Connect**.

## 5. Create your account

1. After Connect, the app shows a **sign-in screen**. The first time, tap
   **“New here? Create an account.”**
2. Enter your email and a password → **Create account**. With *Confirm email*
   off (step 2), you're signed in instantly — no email to check. Your current
   data is uploaded automatically as the starting point.

## 6. Add your phone (or any other device)

1. Open the app on the other device → **Settings → Cloud Sync**.
2. Paste the **same** Project URL + anon key → **Connect**.
3. **Sign in** with the **same email + password**. The data from your first
   device appears automatically.

That's it. After this, edits sync automatically: they upload a couple of
seconds after you change something, and each device pulls the latest on load
and whenever you switch back to the app. If both devices were edited offline
and then reconnect, you'll get a **conflict prompt** to choose which version to
keep — financial data is never silently overwritten.

---

## What syncs and what doesn't

- **Synced:** everything in your app state — income/expenses, funds & trips,
  retirement plan, places, journal, profile, Spend Insights, chat threads,
  saved Vault reports, and Property IQ history.
- **Not synced (device-local by design):** your **AI API keys** (Claude /
  OpenAI). Because data is stored as readable JSON in your database, keys are
  kept out of the cloud so they never sit in plaintext there — re-enter them
  once per device under Settings → AI Keys.
- **Not synced:** the connection settings themselves (URL, anon key, email,
  sync stamps) — those are per-device.

## Troubleshooting

| Status in Settings | Meaning | Fix |
|---|---|---|
| "Table not found — run the one-time SQL setup" | The `app_state` table doesn't exist | Run the SQL in step 3 |
| "Not authorized — sign in again / re-check the SQL policy" | RLS policy missing or session expired | Re-run the policy SQL; sign out and back in |
| "Wrong email or password" | Typo, or no account yet | Re-check both; if you're new, tap **Create an account** |
| "Email not confirmed yet" | *Confirm email* is still ON in Supabase | Turn it OFF (step 2), or click the confirmation link in your inbox |
| "Network error" | Offline | It retries automatically when you're back online; local data keeps working |

## Security notes

- Only the **anon** key lives in the app. It's public by design; RLS is what
  protects your data. **Never** put the `service_role` key in the app.
- Data is stored as JSON your Supabase project can read (this is the RLS-only
  model). Anyone with dashboard/database access to your project can read it, so
  keep your Supabase account secure (use a strong password + 2FA).

---

## Notebook files (new look) — one-time file storage setup

The new look's **Notebook** page keeps your own files (statements, letters,
budget templates). The list of files syncs with everything else. The files
themselves go to a private storage folder in **your own** Supabase project, so
your other devices can fetch them when you open them.

Until you do this step, nothing breaks: files stay on the device you added them
on, and the Notebook's side panel says "Files can't sync yet".

**Do this once:**

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste everything below and press **Run**.

```sql
-- 1. A private place for your Notebook files
insert into storage.buckets (id, name, public)
values ('horizon-files', 'horizon-files', false)
on conflict (id) do nothing;

-- 2. Rules: each signed-in person can only see and change their own folder
create policy "Notebook files: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'horizon-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Notebook files: add own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'horizon-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Notebook files: replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'horizon-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Notebook files: remove own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'horizon-files' and (storage.foldername(name))[1] = auth.uid()::text);
```

3. Open Horizon, go to **Notebook**. Files you added earlier upload by themselves
   within a few seconds.

**Good to know**

- Each file is stored as `your-account-id / file-id / file name`. Only you can
  reach your folder; the bucket is private (not a public link).
- On another device, a file shows **"On another device"**. Press it twice and it
  is fetched and opened.
- Supabase's free plan allows files up to 50 MB each and 1 GB in total.
- If you see "already exists" when running the SQL, that part was done before —
  that's fine.
