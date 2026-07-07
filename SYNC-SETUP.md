# Cloud Sync setup (Supabase Auth + RLS)

Horizon syncs your data across devices by storing it in **your own** Supabase
project, keyed to your signed-in account and fenced off by Row Level Security.
You sign in with your email (magic link) — no codes to copy between devices.

These are the one-time steps **you** do in the Supabase dashboard. Everything
else happens in the app.

---

## 1. Create a project

1. Go to **supabase.com** → sign up (free) → **New project**.
2. Pick a name and a strong database password (you won't need the password for
   the app). Wait ~1 minute for it to provision.

## 2. Enable email sign-in

1. In the dashboard: **Authentication → Providers → Email**.
2. Make sure **Email** is enabled. Magic-link sign-in is on by default — you
   don't need to enable passwords.

## 3. Set the redirect URL

The magic-link email needs to know where to send you back.

1. **Authentication → URL Configuration**.
2. Set **Site URL** to where the app is hosted, e.g. `https://horizonos.netlify.app`.
   (For local testing you can also add `http://localhost:...`.)
3. Add the same URL under **Redirect URLs**.

> If you skip this, the sign-in link will fail or bounce you to the wrong page.

## 4. Create the table + policy

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

## 5. Copy your keys into the app

1. In the dashboard: **Project Settings → API**.
2. Copy the **Project URL** (e.g. `https://abcd1234.supabase.co`) and the
   **anon public** key (a long `eyJ...` string — this one is safe to put in a
   client; the `service_role` key is **not** — never paste that anywhere).
3. In Horizon: **Settings → Cloud Sync**, paste both, click **Connect**.

## 6. Sign in

1. After Connect, the app shows a **sign-in screen**. Enter your email →
   **Send magic link**.
2. Open the email **on that same device** and tap the link. It brings you back
   to the app, now signed in. Your current data is uploaded automatically as
   the starting point.

## 7. Add your phone (or any other device)

1. Open the app on the other device → **Settings → Cloud Sync**.
2. Paste the **same** Project URL + anon key → **Connect**.
3. Sign in with the **same email**. The data from your first device appears
   automatically.

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
| "Table not found — run the one-time SQL setup" | The `app_state` table doesn't exist | Run the SQL in step 4 |
| "Not authorized — sign in again / re-check the SQL policy" | RLS policy missing or session expired | Re-run the policy SQL; sign out and back in |
| Magic link doesn't sign you in | Redirect URL not set | Do step 3, then request a new link |
| "Network error" | Offline | It retries automatically when you're back online; local data keeps working |

## Security notes

- Only the **anon** key lives in the app. It's public by design; RLS is what
  protects your data. **Never** put the `service_role` key in the app.
- Data is stored as JSON your Supabase project can read (this is the RLS-only
  model). Anyone with dashboard/database access to your project can read it, so
  keep your Supabase account secure (use a strong password + 2FA).
