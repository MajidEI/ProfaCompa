# Deployment Guide - Vercel

This guide walks you through deploying the Salesforce Profile Compare tool to Vercel.

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Vercel                      │
│                                             │
│  ┌─────────────┐     ┌──────────────────┐  │
│  │   Frontend  │     │  API (Serverless) │  │
│  │  React/Vite │ ──► │   /api/*          │  │
│  │     /       │     │                   │  │
│  └─────────────┘     └──────────────────┘  │
│                              │              │
└──────────────────────────────┼──────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │  Salesforce API  │
                    └──────────────────┘
```

Everything runs on Vercel:
- **Frontend**: React + Vite (static files)
- **API**: Serverless functions at `/api/*`

---

## Prerequisites

- A [Vercel account](https://vercel.com) (free tier available)
- A [GitHub account](https://github.com) with your code pushed
- Your Salesforce Connected App credentials

---

## Step 1: Update Salesforce Connected App

Before deploying, update your Salesforce Connected App callback URL:

1. Go to **Salesforce Setup** → **App Manager**
2. Find your Connected App → **Edit**
3. Update the **Callback URL** to:
   ```
   https://YOUR-APP-NAME.vercel.app/api/auth/callback
   ```
   (You'll get the exact URL after deploying - you can update this later)

---

## Step 2: Deploy to Vercel

### Option A: Using Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository (**ProfaCompa**)
4. Configure the project:

| Setting | Value |
|---------|-------|
| **Framework Preset** | Other |
| **Root Directory** | `.` (leave as root) |
| **Build Command** | `cd frontend && npm install && npm run build` |
| **Output Directory** | `frontend/dist` |
| **Install Command** | `npm install` |

5. **Add Environment Variables** (click "Environment Variables"):

| Name | Value |
|------|-------|
| `SF_CLIENT_ID` | Your Salesforce Consumer Key |
| `SF_CLIENT_SECRET` | Your Salesforce Consumer Secret |
| `SF_CALLBACK_URL` | `https://YOUR-APP.vercel.app/api/auth/callback` |
| `JWT_SECRET` | Generate a random string (use: `openssl rand -hex 32`) |
| `SF_LOGIN_URL` | `https://login.salesforce.com` (or `https://test.salesforce.com` for sandbox) |

6. Click **"Deploy"**

### Option B: Using Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy (from project root)
vercel

# Follow prompts, then add environment variables:
vercel env add SF_CLIENT_ID
vercel env add SF_CLIENT_SECRET
vercel env add SF_CALLBACK_URL
vercel env add JWT_SECRET
vercel env add SF_LOGIN_URL

# Redeploy with environment variables
vercel --prod
```

---

## Step 3: Update Salesforce Callback URL

After deployment, get your Vercel URL (e.g., `profacompa.vercel.app`) and:

1. Update the `SF_CALLBACK_URL` environment variable in Vercel:
   ```
   https://profacompa.vercel.app/api/auth/callback
   ```

2. Update your Salesforce Connected App callback URL to match.

3. Redeploy or wait for the next deployment.

---

## Step 4: Verify Deployment

1. Open your Vercel URL in a browser
2. Click "Login to Salesforce"
3. Complete the OAuth flow
4. Select profiles and compare!

---

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SF_CLIENT_ID` | Yes | Salesforce Connected App Consumer Key | `3MVG9...` |
| `SF_CLIENT_SECRET` | Yes | Salesforce Connected App Consumer Secret | `1234567890...` |
| `SF_CALLBACK_URL` | Yes | OAuth callback URL | `https://app.vercel.app/api/auth/callback` |
| `JWT_SECRET` | Yes | Secret for JWT session tokens (32+ chars) | `a1b2c3d4...` |
| `SF_LOGIN_URL` | No | Salesforce login URL (default: production) | `https://login.salesforce.com` |

---

## Troubleshooting

### "Invalid redirect_uri" from Salesforce

- The `SF_CALLBACK_URL` must **exactly match** what's in your Connected App
- Include the protocol (`https://`)
- No trailing slash
- Must be `/api/auth/callback`

### "CORS Error" in browser console

- This shouldn't happen with the Vercel deployment since everything is on the same domain
- Clear your browser cookies and try again

### "Session not found" / Keeps logging out

- Ensure `JWT_SECRET` is set and consistent across deployments
- Check that cookies are being set (look in browser DevTools → Application → Cookies)

### OAuth flow redirects to wrong URL

- Check `SF_CALLBACK_URL` environment variable
- Ensure your Salesforce Connected App callback matches

### API returning 500 errors

- Check Vercel Functions logs: Project → Functions → View logs
- Verify all environment variables are set correctly

---

## Custom Domain (Optional)

1. Go to Vercel Project → **Settings** → **Domains**
2. Add your custom domain
3. Update DNS records as instructed
4. Update `SF_CALLBACK_URL` to use your custom domain
5. Update Salesforce Connected App callback URL

---

## Local Development

To run locally with the Vercel structure:

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..

# Start the old backend for local dev
cd backend && npm run dev

# In another terminal, start frontend
cd frontend && npm run dev
```

Or use Vercel CLI for local serverless functions:

```bash
vercel dev
```

---

## Costs

**Vercel Free Tier includes:**
- 100 GB bandwidth/month
- 100 GB-Hours serverless function execution
- Unlimited deployments

This is more than sufficient for typical usage of this tool.
