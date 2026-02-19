# Supabase Setup Guide

> **Deprecated** — Architecture pivoted to self-deploy SQLite. See [development-reference](../development-reference.md) and [configuration-reference](../reference/configuration-reference.md).

This document describes how to configure Supabase as the persistence layer for Dossier (Slice A core planning entities).

## Project Structure

```
supabase/
  migrations/
    20240213000001_slice_a_enums_and_foundation.sql   # Enums, Project, WorkflowLabel, VersionLabel
    20240213000002_slice_a_workflow_hierarchy.sql     # Workflow, WorkflowActivity, Step, Card
    20240213000003_slice_a_planning_action.sql         # PlanningAction

lib/
  supabase/
    client.ts    # Browser-side Supabase client (Client Components)
    server.ts    # Server-side Supabase client (Server Components, API routes)
    queries/     # Server-side query helpers (implemented in Step 4)
```

## Creating a Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) and sign in.
2. Click **New Project**.
3. Choose an organization, name your project, set a database password, and select a region.
4. Wait for the project to be provisioned.

## Getting Credentials

1. In your Supabase project, go to **Settings** → **API**.
2. Copy the **Project URL** and **anon** (public) key from the **Project API keys** section.
3. For local development, you can also use the **publishable** key if your project uses the new key format.

## Environment Configuration

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and set:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Never commit `.env.local` (it is in `.gitignore`).

## Applying Migrations

### Option A: Supabase CLI (Recommended)

1. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link your project (from project root):
   ```bash
   supabase link --project-ref your-project-ref
   ```
   The project ref is the substring in your URL (e.g. `abcdefgh` from `https://abcdefgh.supabase.co`).

3. Push migrations:
   ```bash
   supabase db push
   ```

### Option B: Supabase Dashboard

1. Go to your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor**.
3. Run each migration file in order:
   - `20240213000001_slice_a_enums_and_foundation.sql`
   - `20240213000002_slice_a_workflow_hierarchy.sql`
   - `20240213000003_slice_a_planning_action.sql`

### Option C: Local Supabase (Docker)

For local development with a full Supabase stack:

1. Install [Docker](https://docs.docker.com/get-docker/).
2. Initialize and start:
   ```bash
   supabase init
   supabase start
   ```
3. Migrations apply automatically on `supabase start`.
4. Get local credentials: `supabase status` (shows API URL and anon key).

## Running Database Integration Tests

Database tests require a configured Supabase instance with migrations applied.

1. Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in `.env.local`.
2. Run the database test suite:
   ```bash
   pnpm test:db
   ```
   Or:
   ```bash
   pnpm test __tests__/database/
   ```

If the environment variables are not set, the database tests are skipped automatically.

## Slice A Schema Summary

| Table | Purpose |
|-------|---------|
| `project` | Top-level project container |
| `workflow_label` | Taxonomy for workflow categorization |
| `version_label` | Taxonomy for version/release labels |
| `workflow` | Workflow within a project |
| `workflow_activity` | Activity within a workflow |
| `step` | Step within an activity |
| `card` | Card within a step (or activity fallback) |
| `planning_action` | Mutation log (createWorkflow, createCard, etc.) |

## No-Auth POC

This setup does **not** enable Supabase Auth or Row Level Security (RLS). Tables created via migrations do not have RLS enabled by default. When auth is added in a later phase:

1. Enable RLS on each table.
2. Add policies that restrict access based on authenticated user.
3. Update the Supabase client configuration if needed.

## Rollback

To roll back migrations (Supabase CLI):

```bash
supabase db reset
```

This resets the database to a clean state and re-applies all migrations. **Warning:** This deletes all data.

## Troubleshooting

### "Missing Supabase env vars"
- Ensure `.env.local` exists and contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Restart the Next.js dev server after changing env vars.

### Migration fails with "relation already exists"
- The migration may have been partially applied. Check the Supabase dashboard **Database** → **Migrations** for applied migrations.
- To re-run: drop the objects manually or use `supabase db reset` (destructive).

### Database tests are skipped
- Set the environment variables. Vitest loads `.env` files; ensure `.env.local` is in the project root and variables are exported if running tests in a separate process.
