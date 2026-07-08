# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in Playcall, do not open a public GitHub issue.

Please report it privately through GitHub's vulnerability reporting flow for this repository:

- Open the repository on GitHub
- Go to the `Security` tab
- Click `Advisories`
- Use `Report a vulnerability`

If you cannot access that flow, contact the maintainer privately via the repository owner profile: [@Dphenomenal101](https://github.com/Dphenomenal101).

When reporting, include:

- A clear description of the issue and affected component
- Reproduction steps or a proof of concept
- Impact assessment
- Any suggested remediation, if you have one

## Supported versions

This project does not currently maintain long-term support branches.

Security fixes are expected to land on the latest code on the default branch first. If you self-host Playcall, you should stay reasonably current with upstream changes.

## Security model

Playcall handles potentially sensitive business data, including:

- Call transcripts and audio-derived transcripts
- Playbooks and uploaded source documents
- Buyer and company context used for scoring
- Workspace-scoped provider credentials when teams use BYOK integrations

Current protections in the repository include:

- Supabase Row Level Security (RLS) policies for workspace-scoped application data
- AES-256-GCM encryption for stored workspace provider credentials via `WORKSPACE_SECRETS_ENCRYPTION_KEY`
- Server-side use of privileged Supabase credentials for operations that legitimately cross RLS boundaries
- Signed webhook verification for external callbacks such as LlamaParse

## Self-hosting responsibilities

If you deploy your own instance, you are responsible for the security of your environment and configuration. At minimum:

- Set strong, unique values for `WORKSPACE_SECRETS_ENCRYPTION_KEY`, `CRON_SECRET`, and webhook secrets
- Never expose `SUPABASE_SERVICE_ROLE_KEY` client-side
- Set `NEXT_PUBLIC_APP_URL` to your real production URL, not `localhost`
- Review Supabase Auth, RLS, and storage configuration before handling real customer data
- Rotate provider keys and other credentials if you suspect compromise
- Restrict access to your Vercel, Supabase, and any connected provider accounts

## Scope and limitations

Playcall is open source and self-hostable, but this repository does not claim any formal security certification or third-party audit.

You should review the code, infrastructure, and vendor configuration yourself before using it in a production environment with sensitive customer data.
