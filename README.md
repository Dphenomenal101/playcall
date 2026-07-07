# Playcall

Playbook-based sales call scoring for GTM teams. Reps upload call transcripts or recordings, managers define scoring rubrics ("playbooks"), and Playcall scores every call against the rubric using buyer-aware AI evaluation. Bring your own LLM and enrichment keys per workspace, or use app-level fallback keys.

## Tech stack

- **Framework**: [Next.js 16](https://nextjs.org) (App Router) + React 19
- **Database / Auth**: [Supabase](https://supabase.com) (Postgres, Auth, RLS, Edge Functions)
- **AI**: [Vercel AI SDK](https://sdk.vercel.ai) (OpenAI + Anthropic + 15 other providers, BYOK per workspace)
- **Document parsing**: [LlamaParse](https://cloud.llamaindex.ai) — handles PDF, DOCX, PPTX, images, tables, visual layouts (130+ formats)
- **Audio transcription**: [OpenAI Whisper](https://platform.openai.com/docs/guides/speech-to-text) (async, only for audio call uploads)
- **File uploads**: [Vercel Blob](https://vercel.com/docs/vercel-blob) (direct browser uploads, bypasses serverless body-size limits)
- **Enrichment**: [Exa](https://exa.ai) (buyer/company context lookup)
- **UI**: Tailwind CSS + shadcn/ui (Radix primitives)
- **Hosting**: Vercel (app + cron) + Supabase (database + Edge Functions)

## Architecture at a glance

```
Rep pastes transcript or uploads a plain-text file (TXT, CSV)
  -> Next.js route handler reads text inline
  -> scoring pipeline starts immediately

Rep uploads a rich transcript document (PDF, DOCX, PPTX)
  -> Next.js route handler uploads to Vercel Blob server-side
  -> submitted to LlamaParse for visual-aware parsing
  -> LlamaParse webhook fires when done -> transcript text stored -> scoring starts

Rep uploads audio recording
  -> browser uploads directly to Vercel Blob (no serverless size cap)
  -> Next.js route handler receives only the Blob URL
  -> async Whisper transcription job -> transcript stored -> scoring starts

Manager uploads playbook source docs
  -> browser uploads directly to Vercel Blob (no serverless size cap)
  -> plain text files (TXT, MD, CSV): extracted inline, rubric gen starts immediately
  -> rich files (PDF, DOCX, PPTX, images): submitted to LlamaParse for visual-aware parsing
  -> LlamaParse webhook fires when done -> text stored -> rubric gen triggered

Scoring pipeline
  -> processing_jobs table (Supabase) tracks async work
  -> Supabase Edge Function (process-job) does the actual LLM scoring
  -> falls back to in-process execution if the Edge Function call fails

Everything is workspace-scoped via Postgres RLS; a service-role client is
only used server-side for writes that legitimately cross RLS boundaries.
```

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io) (`npm install -g pnpm`)
- A [Supabase](https://supabase.com) account (free tier is fine)
- A [Vercel](https://vercel.com) account (free tier is fine)
- An OpenAI and/or Anthropic API key (for LLM scoring; OpenAI also needed for audio transcription)
- A [LlamaParse](https://cloud.llamaindex.ai) API key (free tier: 10k credits/month, resets monthly)
- (Optional) An [Exa](https://exa.ai) API key for buyer enrichment

---

## Setup, A to Z

### 1. Clone and install

```bash
git clone <your-fork-url> playcall
cd playcall
pnpm install
```

### 2. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) -> **New project**
2. Pick a name, region, and database password (save the password somewhere)
3. Wait for provisioning to finish (~2 minutes)

### 2b. Configure email (SMTP)

Playcall uses **email OTP** (6-digit one-time codes) for sign-in, but rep invite emails contain a **magic link** that redirects back to the app. Two things to configure in your Supabase dashboard:

**Authentication → URL Configuration**
- **Site URL**: your production domain (e.g. `https://yourdomain.com`)
- **Redirect URLs**: add `https://yourdomain.com/auth` — invite magic links redirect here

**Authentication → Email Settings → Enable Custom SMTP**
Supabase's built-in sender is rate-limited to ~3 emails/hour on the free tier, which blocks sign-ins under real load. Any transactional provider works (Resend, Postmark, SendGrid, AWS SES). Resend has a generous free tier and takes under 5 minutes to set up.

### 3. Apply the database schema

Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) if you don't have it:

```bash
brew install supabase/tap/supabase
```

Link the CLI to your new project and push the schema:

```bash
supabase login
supabase link --project-ref <your-project-ref>   # found in Project Settings -> General
supabase db push
```

This applies the migrations in [`supabase/migrations/`](supabase/migrations/) — every table, RLS policy, index, and trigger in one step.

### 4. Get your Supabase API keys

In your Supabase dashboard: **Project Settings -> API**

You'll need:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — never expose client-side)

### 5. Deploy the Edge Function

Playcall uses one Supabase Edge Function (`process-job`) to run scoring jobs outside the request/response cycle:

```bash
supabase functions deploy process-job
```

The function reads `SUPABASE_SERVICE_ROLE_KEY`, which Supabase auto-injects into every Edge Function's environment — no manual config needed there.

After deploying, set the secrets the Edge Function needs. These are **separate** from your `.env.local` and Vercel environment — Edge Functions run in Deno and have their own isolated secret store:

```bash
# Required — used to decrypt workspace BYOK credentials stored in the database.
# Must match WORKSPACE_SECRETS_ENCRYPTION_KEY in your .env.local / Vercel config.
supabase secrets set WORKSPACE_SECRETS_ENCRYPTION_KEY=your_key

# Required if you are not using BYOK per workspace (app-level fallback keys).
# If every workspace has its own OpenAI key set in Settings, you can skip these.
supabase secrets set OPENAI_API_KEY=your_key
supabase secrets set ANTHROPIC_API_KEY=your_key   # optional fallback

# Optional — for buyer enrichment. Same BYOK caveat applies.
supabase secrets set EXA_API_KEY=your_key
```

> **Heads up:** skipping `WORKSPACE_SECRETS_ENCRYPTION_KEY` means the Edge Function cannot decrypt BYOK credentials and falls back to env-level keys. Skipping both means the Edge Function cannot call any LLM — it returns a 400 and Playcall falls back to running scoring in-process on Next.js instead. Everything still works, but you lose async edge execution.

### 6. Set up Vercel Blob

Playbook source-document uploads (PDFs, decks, etc.) and audio call recordings go straight from the browser to Vercel Blob, bypassing serverless function body-size limits entirely.

1. Create a Vercel project for this repo: [vercel.com/new](https://vercel.com/new) (you don't need to deploy yet)
2. In the project dashboard: **Storage -> Create -> Blob**
3. Name it anything (e.g. `playcall-uploads`) and **Connect to project**

Vercel auto-injects `BLOB_READ_WRITE_TOKEN`. Pull it for local dev:

```bash
vercel link        # link local repo to Vercel project (one-time)
vercel env pull .env.local
```

### 7. Set up LlamaParse

LlamaParse handles all rich document parsing (PDFs, DOCX, PPTX, visual layouts, images, tables).

1. Sign up at [cloud.llamaindex.ai](https://cloud.llamaindex.ai) — free tier gives 10k credits/month
2. Create an API key from the dashboard
3. Generate a webhook secret: `openssl rand -hex 32`
4. Set `LLAMA_CLOUD_WEBHOOK_URL` to the full webhook URL including path:
   - Local dev: `https://abc123.ngrok-free.app/api/webhooks/llamaparse`
   - Production: `https://yourdomain.com/api/webhooks/llamaparse`

> **Dashboard webhook (optional backup):** You can also configure a global webhook in the LlamaParse dashboard under **API Keys → Webhooks → Edit webhook**. If you do, set:
> - **Webhook URL**: same full URL as above
> - **Events**: `parse.success` and `parse.error` (both checked)
> - **Payload format**: `json` — not the default "string", which breaks JSON parsing
> - **Signing secret**: same value as your `LLAMA_CLOUD_WEBHOOK_SECRET`
>
> The app attaches a per-job webhook on every submission automatically, so the dashboard webhook is not required — but it acts as a fallback if the per-job config is ever dropped.

### 8. Get AI provider keys

- **OpenAI** (required for scoring + audio transcription): [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Anthropic** (optional fallback): [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- **Exa** (optional, for buyer enrichment): [dashboard.exa.ai/api-keys](https://dashboard.exa.ai/api-keys)

These are app-level fallback keys. Managers can also configure their own keys per workspace via **Settings → Integrations** (BYOK) — workspace keys always take priority.

### 9. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the values from steps 4, 6, 7, and 8. The full list with inline explanations is in [`.env.example`](.env.example). Generate the secrets-encryption key (encrypts BYOK credentials at rest):

```bash
openssl rand -base64 32
```

Paste the output as `WORKSPACE_SECRETS_ENCRYPTION_KEY`. Pick any random 16+ character string for `CRON_SECRET`.

See [`.env.example`](.env.example) for the full annotated list.

### 10. Run the dev server

```bash
pnpm dev
```

Open [localhost:3000](http://localhost:3000). You should land on the marketing/landing page with a "Get started" flow into manager onboarding.

### 11. Walk through onboarding

1. Sign up as a manager
2. Step 1: workspace name + your name
3. Step 2: configure AI providers (or skip — app-level fallback keys cover you)
4. Step 3: build your first playbook (upload source material, let AI draft a rubric)
5. Step 4: invite reps

---

## Deploying to production

### 1. Push to GitHub, import into Vercel

[vercel.com/new](https://vercel.com/new) -> import your repo (or use the project you created in step 6).

### 2. Set environment variables in Vercel

**Project Settings -> Environment Variables** -> add everything from your `.env.local`, **except** `BLOB_READ_WRITE_TOKEN` (Vercel sets that automatically once you connect the Blob store).

### 3. Deploy

Vercel deploys automatically on push to your default branch. The first deploy also activates the cron job defined in [`vercel.json`](vercel.json) (`/api/cron/keep-alive`, daily) — this stops Supabase free-tier projects from auto-pausing after 7 days of inactivity.

### 4. Verify the cron is wired up

Vercel Dashboard -> your project -> **Cron Jobs** tab. You should see one entry for `/api/cron/keep-alive`.

---

## Project structure

```
app/
  manager/          Manager dashboard, onboarding, playbooks, settings
  rep/              Rep dashboard, call upload, profile
  api/live/         Route handlers backing the live (non-demo) data paths
  api/cron/         Vercel Cron endpoints
  api/blob-upload/  Vercel Blob client-upload token exchange
lib/
  data/             Server-side read/write logic (Supabase queries)
  ai/               Provider registry, BYOK runtime config resolution
  extraction/       Whisper audio transcription + plain-text file reading
  integrations/     LlamaParse document parsing client + webhook verification
  jobs/             Async job dispatch (Edge Function-first, local fallback)
  security/         Credential encryption at rest
components/         Shared UI (shadcn/ui-based)
supabase/
  migrations/       Database schema migrations
  functions/        Edge Functions (process-job)
```

## License

[MIT](LICENSE)
