# crmprm-bdbd

BUDBOX CRM monorepo. The frontend is a Vite app in `artifacts/budbox-crm`; the
authenticated CRM API is in `artifacts/api-server`; shared API and database
packages are under `lib/`.

## Local development

Install dependencies from the repository root with pnpm:

```sh
pnpm install
pnpm run typecheck
pnpm --dir artifacts/budbox-crm dev
```

Build the production applications:

```sh
pnpm --dir artifacts/budbox-crm build
pnpm --dir artifacts/api-server build
```

## Deployment

- **Netlify frontend:** use the repository root as the base directory. The
  root `netlify.toml` configures the build and SPA fallback. Set
  `VITE_API_BASE_URL` to the public Render API origin, and set
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the public Supabase
  project values.
- **Render API:** create the service from the root `render.yaml` Blueprint.
  Configure `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`; add the
  Nova Poshta and Google Sheets variables only when those integrations are
  enabled. The API health endpoint is `/api/healthz`.
- **Secrets:** do not commit `.env` files. Use the `.env.example` files as
  variable-name references and configure production values in the hosting
  providers.

The frontend and API must use the same Supabase project. The API verifies
Supabase bearer tokens and uses the signed-in user's email for manager
attribution.
"# crmprm-bdbd" 
