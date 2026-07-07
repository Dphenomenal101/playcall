-- Playcall initial schema (consolidated)
-- This single migration represents the full current schema for a fresh
-- Supabase project. It replaces what was previously 15 incremental
-- migrations accumulated during early development; squashed here for a
-- clean open-source starting point.

create extension if not exists pgcrypto;

-- ============================================================================
-- Enums
-- ============================================================================

create type public.app_role as enum ('manager', 'rep');
create type public.membership_status as enum ('active', 'inactive');
create type public.playbook_status as enum ('draft', 'published', 'archived');
create type public.playbook_source_type as enum (
  'prompt', 'pdf', 'docx', 'txt', 'csv', 'pptx', 'markdown', 'doc', 'ppt', 'mp3', 'wav', 'm4a'
);
create type public.processing_status as enum ('queued', 'processing', 'ready', 'failed');
create type public.call_artifact_kind as enum ('transcript', 'audio', 'note');
create type public.outcome_status as enum (
  'no-show', 'next step booked', 'moved stage', 'closed won', 'closed lost', 'no advancement'
);
create type public.processing_job_status as enum ('queued', 'processing', 'completed', 'failed', 'canceled');
create type public.workspace_provider_role as enum ('primary_llm', 'fallback_llm', 'enrichment', 'document_parsing');

-- ============================================================================
-- Tables
-- ============================================================================

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_domain text,
  company_logo_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_sign_in_at timestamptz
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, user_id)
);

create table public.pending_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.app_role not null,
  playbook_ids uuid[] not null default '{}'::uuid[],
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  sent_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  target_segment text,
  methodology text,
  status public.playbook_status not null default 'draft',
  processing_status public.processing_status not null default 'queued',
  applicable_call_types text[] not null default '{}'::text[],
  source_types public.playbook_source_type[] not null default '{}'::public.playbook_source_type[],
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, slug)
);

create table public.playbook_source_documents (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  source_type public.playbook_source_type not null,
  pasted_content text,
  file_size_bytes bigint,
  processing_status public.processing_status not null default 'queued',
  processing_error text,
  llama_job_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.playbook_categories (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  weight numeric(5,2) not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.playbook_criteria (
  id uuid primary key default gen_random_uuid(),
  playbook_category_id uuid not null references public.playbook_categories(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  criterion text not null,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.playbook_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default timezone('utc', now()),
  unique (playbook_id, user_id)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  playbook_id uuid not null references public.playbooks(id) on delete restrict,
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_linkedin_url text,
  contact_role text,
  call_type text not null,
  deal_stage_before text,
  deal_stage_after text,
  outcome public.outcome_status,
  pipeline_amount numeric(12,2),
  loss_reason text,
  rep_notes text,
  processing_status public.processing_status not null default 'queued',
  occurred_at timestamptz not null default timezone('utc', now()),
  submitted_at timestamptz not null default timezone('utc', now()),
  buyer_context jsonb not null default '{}'::jsonb,
  scoring_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.call_artifacts (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind public.call_artifact_kind not null,
  file_name text,
  mime_type text,
  transcript_text text,
  metadata jsonb not null default '{}'::jsonb,
  processing_status public.processing_status not null default 'queued',
  processing_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.call_scores (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  overall_score numeric(5,2),
  playbook_adherence numeric(5,2),
  discovery_quality numeric(5,2),
  qualification numeric(5,2),
  objection_handling numeric(5,2),
  product_accuracy numeric(5,2),
  next_step_clarity numeric(5,2),
  talk_ratio numeric(5,2),
  listen_ratio numeric(5,2),
  buyer_aware_feedback text,
  best_moment text,
  top_missed_moment text,
  recommended_coaching_drill text,
  missed_questions text[] not null default '{}'::text[],
  missed_opportunities text[] not null default '{}'::text[],
  product_inaccuracies text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.call_score_dimensions (
  id uuid primary key default gen_random_uuid(),
  call_score_id uuid not null references public.call_scores(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_name text not null,
  score numeric(5,2) not null,
  out_of numeric(5,2) not null default 10,
  summary_note text,
  transcript_evidence jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.coaching_comments (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  job_type text not null,
  status public.processing_job_status not null default 'queued',
  provider text,
  attempt_count integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.workspace_provider_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider_type text not null,
  role public.workspace_provider_role not null,
  encrypted_credentials jsonb not null default '{}'::jsonb,
  selected_default_model text,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, role)
);

create table public.workspace_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider_id text not null,
  encrypted_credentials jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, provider_id)
);

create table public.playbook_generation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  provider text,
  model text,
  status public.processing_job_status not null default 'queued',
  source_document_ids uuid[] not null default '{}'::uuid[],
  generated_summary text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  provider text,
  status public.processing_job_status not null default 'queued',
  request_identity jsonb not null default '{}'::jsonb,
  source_urls text[] not null default '{}'::text[],
  field_confidence jsonb not null default '{}'::jsonb,
  normalized_output jsonb not null default '{}'::jsonb,
  raw_output jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index idx_workspace_members_user on public.workspace_members (user_id);
create index idx_workspace_members_workspace on public.workspace_members (workspace_id);
create index idx_workspaces_created_by on public.workspaces (created_by);

create index idx_pending_invites_email on public.pending_invites (lower(email));
create index idx_pending_invites_invited_by on public.pending_invites (invited_by);
create unique index pending_invites_workspace_email_pending_idx
  on public.pending_invites (workspace_id, lower(email))
  where status = 'pending';

create index idx_playbooks_workspace on public.playbooks (workspace_id, status);
create index idx_playbooks_created_by on public.playbooks (created_by);

create index idx_playbook_source_documents_playbook_id on public.playbook_source_documents (playbook_id);
create index idx_playbook_source_documents_workspace_id on public.playbook_source_documents (workspace_id);

create index idx_playbook_categories_playbook_id on public.playbook_categories (playbook_id);
create index idx_playbook_categories_workspace_id on public.playbook_categories (workspace_id);

create index idx_playbook_criteria_playbook_category_id on public.playbook_criteria (playbook_category_id);
create index idx_playbook_criteria_workspace_id on public.playbook_criteria (workspace_id);

create index idx_playbook_assignments_user on public.playbook_assignments (user_id);
create index idx_playbook_assignments_assigned_by on public.playbook_assignments (assigned_by);
create index idx_playbook_assignments_workspace_id on public.playbook_assignments (workspace_id);

create index idx_calls_workspace on public.calls (workspace_id, occurred_at desc);
create index idx_calls_rep on public.calls (rep_id, occurred_at desc);
create index idx_calls_playbook on public.calls (playbook_id, occurred_at desc);

create index idx_call_artifacts_call_id on public.call_artifacts (call_id);
create index idx_call_artifacts_workspace_id on public.call_artifacts (workspace_id);

create index idx_call_scores_workspace_id on public.call_scores (workspace_id);

create index idx_call_score_dimensions_call_score_id on public.call_score_dimensions (call_score_id);
create index idx_call_score_dimensions_workspace_id on public.call_score_dimensions (workspace_id);

create index idx_coaching_comments_author_id on public.coaching_comments (author_id);
create index idx_coaching_comments_call_id on public.coaching_comments (call_id);
create index idx_coaching_comments_workspace_id on public.coaching_comments (workspace_id);
create index idx_coaching_comments_call_read on public.coaching_comments (call_id, read_at);

create index idx_processing_jobs_workspace_status on public.processing_jobs (workspace_id, status, created_at desc);
create index idx_processing_jobs_entity on public.processing_jobs (entity_type, entity_id, created_at desc);
create index idx_processing_jobs_job_type_status on public.processing_jobs (job_type, status, created_at desc);
create unique index processing_jobs_one_active_job_per_entity_idx
  on public.processing_jobs (entity_type, entity_id, job_type)
  where status in ('queued', 'processing');

-- ============================================================================
-- Functions
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, created_at, updated_at)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      updated_at = timezone('utc', now());

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;
revoke execute on function public.handle_new_auth_user() from anon;
revoke execute on function public.handle_new_auth_user() from authenticated;

-- RLS helper functions live in a private schema (not public) so they can
-- never be called directly via PostgREST - only Postgres itself, evaluating
-- policy expressions, can invoke them.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.status = 'active'
  );
$$;

create or replace function private.is_workspace_manager(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.status = 'active'
      and wm.role = 'manager'
  );
$$;

grant execute on function private.is_workspace_member(uuid) to anon, authenticated;
grant execute on function private.is_workspace_manager(uuid) to anon, authenticated;

-- ============================================================================
-- Triggers
-- ============================================================================

create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_workspace_members_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

create trigger set_pending_invites_updated_at
before update on public.pending_invites
for each row execute function public.set_updated_at();

create trigger set_playbooks_updated_at
before update on public.playbooks
for each row execute function public.set_updated_at();

create trigger set_playbook_source_documents_updated_at
before update on public.playbook_source_documents
for each row execute function public.set_updated_at();

create trigger set_playbook_categories_updated_at
before update on public.playbook_categories
for each row execute function public.set_updated_at();

create trigger set_playbook_criteria_updated_at
before update on public.playbook_criteria
for each row execute function public.set_updated_at();

create trigger set_calls_updated_at
before update on public.calls
for each row execute function public.set_updated_at();

create trigger set_call_artifacts_updated_at
before update on public.call_artifacts
for each row execute function public.set_updated_at();

create trigger set_call_scores_updated_at
before update on public.call_scores
for each row execute function public.set_updated_at();

create trigger set_call_score_dimensions_updated_at
before update on public.call_score_dimensions
for each row execute function public.set_updated_at();

create trigger set_coaching_comments_updated_at
before update on public.coaching_comments
for each row execute function public.set_updated_at();

create trigger set_processing_jobs_updated_at
before update on public.processing_jobs
for each row execute function public.set_updated_at();

create trigger set_workspace_provider_settings_updated_at
before update on public.workspace_provider_settings
for each row execute function public.set_updated_at();

create trigger set_workspace_provider_credentials_updated_at
before update on public.workspace_provider_credentials
for each row execute function public.set_updated_at();

create trigger set_playbook_generation_runs_updated_at
before update on public.playbook_generation_runs
for each row execute function public.set_updated_at();

create trigger set_enrichment_runs_updated_at
before update on public.enrichment_runs
for each row execute function public.set_updated_at();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.pending_invites enable row level security;
alter table public.playbooks enable row level security;
alter table public.playbook_source_documents enable row level security;
alter table public.playbook_categories enable row level security;
alter table public.playbook_criteria enable row level security;
alter table public.playbook_assignments enable row level security;
alter table public.calls enable row level security;
alter table public.call_artifacts enable row level security;
alter table public.call_scores enable row level security;
alter table public.call_score_dimensions enable row level security;
alter table public.coaching_comments enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.workspace_provider_settings enable row level security;
alter table public.workspace_provider_credentials enable row level security;
alter table public.playbook_generation_runs enable row level security;
alter table public.enrichment_runs enable row level security;

create policy "profiles are visible to workspace members"
on public.profiles
for select
using (
  id = auth.uid()
  or exists (
    select 1
    from public.workspace_members self_member
    join public.workspace_members other_member
      on self_member.workspace_id = other_member.workspace_id
    where self_member.user_id = auth.uid()
      and self_member.status = 'active'
      and other_member.user_id = public.profiles.id
      and other_member.status = 'active'
  )
);

create policy "users can insert their own profile"
on public.profiles
for insert
with check (id = auth.uid());

create policy "users can update their own profile"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "workspace members can view memberships"
on public.workspace_members
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage memberships"
on public.workspace_members
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view workspaces"
on public.workspaces
for select
using (private.is_workspace_member(id));

create policy "workspace managers can manage workspaces"
on public.workspaces
for all
using (private.is_workspace_manager(id))
with check (private.is_workspace_manager(id));

create policy "workspace managers can manage invites"
on public.pending_invites
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view playbooks"
on public.playbooks
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage playbooks"
on public.playbooks
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view playbook sources"
on public.playbook_source_documents
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage playbook sources"
on public.playbook_source_documents
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view playbook categories"
on public.playbook_categories
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage playbook categories"
on public.playbook_categories
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view playbook criteria"
on public.playbook_criteria
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage playbook criteria"
on public.playbook_criteria
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view assignments"
on public.playbook_assignments
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage assignments"
on public.playbook_assignments
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view calls"
on public.calls
for select
using (private.is_workspace_member(workspace_id));

create policy "reps can create their own calls"
on public.calls
for insert
with check (
  rep_id = auth.uid()
  and private.is_workspace_member(workspace_id)
);

create policy "reps can update their own calls and managers can update all calls"
on public.calls
for update
using (
  (rep_id = auth.uid() and private.is_workspace_member(workspace_id))
  or private.is_workspace_manager(workspace_id)
)
with check (
  (rep_id = auth.uid() and private.is_workspace_member(workspace_id))
  or private.is_workspace_manager(workspace_id)
);

create policy "workspace members can view call artifacts"
on public.call_artifacts
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace members can manage call artifacts for visible calls"
on public.call_artifacts
for all
using (private.is_workspace_member(workspace_id))
with check (private.is_workspace_member(workspace_id));

create policy "workspace members can view call scores"
on public.call_scores
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage call scores"
on public.call_scores
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view call score dimensions"
on public.call_score_dimensions
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage call score dimensions"
on public.call_score_dimensions
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view coaching comments"
on public.coaching_comments
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace members can create coaching comments"
on public.coaching_comments
for insert
with check (author_id = auth.uid() and private.is_workspace_member(workspace_id));

create policy "authors and managers can update coaching comments"
on public.coaching_comments
for update
using (
  (author_id = auth.uid() and private.is_workspace_member(workspace_id))
  or private.is_workspace_manager(workspace_id)
)
with check (
  (author_id = auth.uid() and private.is_workspace_member(workspace_id))
  or private.is_workspace_manager(workspace_id)
);

create policy "workspace members can view processing jobs"
on public.processing_jobs
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage processing jobs"
on public.processing_jobs
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace managers can view provider settings"
on public.workspace_provider_settings
for select
using (private.is_workspace_manager(workspace_id));

create policy "workspace managers can manage provider settings"
on public.workspace_provider_settings
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace managers can view provider credentials"
on public.workspace_provider_credentials
for select
using (private.is_workspace_manager(workspace_id));

create policy "workspace managers can manage provider credentials"
on public.workspace_provider_credentials
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view playbook generation runs"
on public.playbook_generation_runs
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage playbook generation runs"
on public.playbook_generation_runs
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));

create policy "workspace members can view enrichment runs"
on public.enrichment_runs
for select
using (private.is_workspace_member(workspace_id));

create policy "workspace managers can manage enrichment runs"
on public.enrichment_runs
for all
using (private.is_workspace_manager(workspace_id))
with check (private.is_workspace_manager(workspace_id));
