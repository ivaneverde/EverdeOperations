This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Share the portal for testing (efficient path)

The fastest way to give people a **stable link** is **one Vercel production URL** + **one Entra redirect URI** + **server env** for Azure Blob (freight JSON). Each branch **preview** gets its own `*.vercel.app` hostname and normally needs **another** redirect URI in Entra, so for reviews it is simpler to share **Production** only.

1. **GitHub → Vercel** — Import the repo and deploy. Use the **Production** URL (or attach one custom domain).
2. **Entra (app registration)** — Authentication → Single-page application → add  
   `https://<your-production-host>/auth/msal-bridge`  
   (keep `http://localhost:3000/auth/msal-bridge` for local dev). Admin consent Graph scopes if you use Teams.
3. **Vercel → Environment Variables (Production)** — At least:  
   `NEXT_PUBLIC_MS_ENTRA_CLIENT_ID`, `NEXT_PUBLIC_MS_ENTRA_TENANT_ID`, **`AZURE_STORAGE_CONNECTION_STRING`** (see `.env.example`). Redeploy after saving.
4. **Share** the production URL; testers sign in with **`@everde.com`**. **Admin → Test fetch** confirms freight JSON from Blob. Optional smoke check: **`GET /api/health`** (JSON `ok: true`).

## Push this repo to GitHub (first time)

There is **no** `origin` remote yet. On GitHub, create a **new empty** repository (no README/license if this clone already has commits). Then from the repo root:

```powershell
.\scripts\setup-github-remote.ps1 https://github.com/OWNER/YOUR-REPO.git
git push -u origin master
```

If your GitHub default branch is **`main`**, use: `git branch -M main` then `git push -u origin main`. After that, Vercel can import the GitHub project and deploy from this branch.

UNC (`PORTAL_DATA_ROOT`) is for **LAN/local**; hosted freight uses **Blob**. Full checklist: `docs/HOSTED_LAUNCH_PLAN.md`. Repo includes **`vercel.json`** (reproducible `npm ci` + build) and **`.github/workflows/ci.yml`** so pushes run lint + build; **`GET /api/health`** is a cheap deploy smoke check.

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Edit files under `src/app`; the app hot-reloads.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) with [Geist](https://vercel.com/font).

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js deployment](https://nextjs.org/docs/app/building-your-application/deploying)
