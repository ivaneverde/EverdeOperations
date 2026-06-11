# Azure quota fix (Total VMs = 0)

If deploy failed with:

```text
Operation cannot be completed without additional quota.
Current Limit (Total VMs): 0
```

your subscription cannot create an App Service plan yet (even Free tier on some accounts).

## Microsoft.Web not in the Provider dropdown?

That is normal on many subscriptions. **App Service “Total VMs”** is not listed under **Compute**. Use **New Quota Request** (see below) or register the provider first:

1. **Subscriptions** → **Azure subscription 1**
2. **Settings** → **Resource providers**
3. Search **`Microsoft.Web`** → **Register** (wait until **Registered**)
4. Retry **Quotas** → Provider list, or skip to **New Quota Request**

## Option 1 — Request quota (recommended for hands-off hosting)

### Path A — **New Quota Request** (use this if Microsoft.Web is missing)

1. Stay on **Quotas | My quotas** (where you are now)
2. Click **New Quota Request** (top)
3. **Quota type:** **App Service** or **Service and subscription limits**
4. **Subscription:** Azure subscription 1
5. **Region:** **West US 2**
6. **Quota name:** **Total VMs** (or closest match)
7. **New limit:** **1**
8. **Details:** `Need Linux App Service plan for internal Microsoft Teams bot (Node.js). Current Total VMs limit is 0.`
9. Submit

### Path B — Usage + quotas (Compute only)

Compute quotas (vCPUs) are **not** the same as App Service **Total VMs**. Do not rely on “Total Regional vCPUs: 10” — deploy still needs Path A.

### Path C — Help + support

**Help + support** → **Create** → **Service and subscription limits (quotas)** → **App Service** → **West US 2** → **Total VMs** → **1**

After approval, redeploy:

```powershell
cd C:\Users\isunderland\everde-ai-operations\teams-claude-bot
.\scripts\deploy-azure-from-env.ps1
```

Or with Basic explicitly:

```powershell
.\azure\deploy-app-service.ps1 -Sku B1 ... (or use deploy-azure-from-env after we add -Sku param)
```

## Option 2 — Retry with Free (F1) SKU

Script default is now **F1** (no dedicated VM). Try:

```powershell
.\scripts\deploy-azure-from-env.ps1
```

If F1 still hits the same error, you must use Option 1.

## Option 3 — Use existing Web App in everdeportal

If you already have an App Service in **everdeportal**, deploy zip there instead of creating a new plan (ask IT / check portal **App Services**).

## Until Azure hosting works

Web Chat requires a **public HTTPS** endpoint. Temporary options:

- Cloudflare tunnel + local bot (laptop on), or
- ngrok paid (no browser block)

Not hands-off until App Service deploy succeeds.
