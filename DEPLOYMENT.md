# Deployment Guide

This guide walks you through deploying the Salesforce Profile Compare tool to production.

## Architecture Overview

```
┌─────────────────┐     HTTPS      ┌─────────────────┐     Salesforce API
│                 │ ◄────────────► │                 │ ◄─────────────────►
│     Vercel      │                │  Render/Railway │                    
│   (Frontend)    │                │    (Backend)    │                    
│                 │                │                 │                    
└─────────────────┘                └─────────────────┘                    
    React + Vite                     Express + Node.js
```

## Prerequisites

- [Node.js 18+](https://nodejs.org/) installed locally
- [Git](https://git-scm.com/) installed
- A [Vercel account](https://vercel.com) (free tier available)
- A [Render account](https://render.com) (free tier available) or [Railway account](https://railway.app)
- Your Salesforce Connected App credentials

---

## Step 1: Push Code to GitHub

1. Create a new repository on GitHub

2. Push your code:
```bash
git add .
git commit -m "Initial commit - Salesforce Profile Compare"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

---

## Step 2: Deploy Backend to Render

### 2.1 Create a New Web Service

1. Go to [render.com](https://render.com) and sign in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure the service:

| Setting | Value |
|---------|-------|
| **Name** | `salesforce-profile-compare-api` |
| **Root Directory** | `backend` |
| **Environment** | `Node` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | Free (or your preference) |

### 2.2 Add Environment Variables

In Render dashboard, go to **Environment** and add:

| Variable | Value |
|----------|-------|
| `SF_CLIENT_ID` | Your Salesforce Connected App Consumer Key |
| `SF_CLIENT_SECRET` | Your Salesforce Connected App Consumer Secret |
| `SF_CALLBACK_URL` | `https://YOUR-APP.onrender.com/auth/callback` |
| `SESSION_SECRET` | Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `FRONTEND_URL` | `https://YOUR-APP.vercel.app` (update after Vercel deploy) |
| `NODE_ENV` | `production` |
| `SF_LOGIN_URL` | `https://login.salesforce.com` (or `https://test.salesforce.com` for sandbox) |

### 2.3 Deploy

Click **"Create Web Service"** and wait for the deployment to complete.

**Note your backend URL**: `https://YOUR-APP.onrender.com`

---

## Step 3: Deploy Frontend to Vercel

### Option A: Using Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository
4. Configure the project:

| Setting | Value |
|---------|-------|
| **Root Directory** | `frontend` |
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

5. Add Environment Variable:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://YOUR-APP.onrender.com` (your backend URL) |

6. Click **"Deploy"**

### Option B: Using Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to frontend
cd frontend

# Deploy
vercel

# Follow the prompts:
# - Link to existing project? No
# - Project name: salesforce-profile-compare
# - Directory: ./
# - Override settings? No
```

After first deploy, set environment variable:
```bash
vercel env add VITE_API_URL
# Enter: https://YOUR-APP.onrender.com
# Select: Production, Preview, Development
```

Then redeploy:
```bash
vercel --prod
```

---

## Step 4: Update Salesforce Connected App

1. Go to **Salesforce Setup** → **App Manager**
2. Find your Connected App and click **Edit**
3. Update the **Callback URL**:
   ```
   https://YOUR-APP.onrender.com/auth/callback
   ```
4. Save the changes

**Note:** Changes may take 2-10 minutes to propagate.

---

## Step 5: Update Backend CORS

Go back to Render and update the `FRONTEND_URL` environment variable with your actual Vercel URL:

```
FRONTEND_URL=https://your-app.vercel.app
```

If you have a custom domain, add it comma-separated:
```
FRONTEND_URL=https://your-app.vercel.app,https://custom-domain.com
```

---

## Step 6: Verify Deployment

1. Open your Vercel URL in a browser
2. Click "Login to Salesforce"
3. Complete the OAuth flow
4. Select profiles and compare!

---

## Troubleshooting

### "CORS Error" in browser console

- Verify `FRONTEND_URL` in backend includes your Vercel domain
- Check that credentials are being sent (should be automatic)

### "Session not found" or logout issues

- Ensure `NODE_ENV=production` is set in backend
- Verify cookie settings allow cross-origin cookies
- Check browser third-party cookie settings

### "Invalid redirect_uri" from Salesforce

- Verify `SF_CALLBACK_URL` matches exactly what's in Connected App
- URL must include protocol (`https://`)
- No trailing slash

### Backend taking long to respond

- Free tier Render services spin down after inactivity
- First request may take 30-60 seconds to wake up
- Consider upgrading to paid tier for always-on

---

## Custom Domain (Optional)

### Vercel (Frontend)

1. Go to Vercel Project → **Settings** → **Domains**
2. Add your custom domain
3. Update DNS records as instructed

### Render (Backend)

1. Go to Render Service → **Settings** → **Custom Domain**
2. Add your custom domain
3. Update DNS records as instructed
4. Update `SF_CALLBACK_URL` and Salesforce Connected App

---

## Environment Variables Summary

### Backend (Render)

| Variable | Description | Example |
|----------|-------------|---------|
| `SF_CLIENT_ID` | Salesforce Consumer Key | `3MVG9...` |
| `SF_CLIENT_SECRET` | Salesforce Consumer Secret | `1234567890...` |
| `SF_CALLBACK_URL` | OAuth callback URL | `https://api.example.com/auth/callback` |
| `SESSION_SECRET` | Session encryption key | `a1b2c3d4e5...` (64 chars) |
| `FRONTEND_URL` | Allowed CORS origins | `https://app.example.com` |
| `NODE_ENV` | Environment mode | `production` |
| `SF_LOGIN_URL` | Salesforce login endpoint | `https://login.salesforce.com` |

### Frontend (Vercel)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://api.example.com` |

---

## Costs

### Free Tier Limitations

| Service | Limit | Notes |
|---------|-------|-------|
| **Vercel** | 100GB bandwidth/month | Sufficient for most use cases |
| **Render** | 750 hours/month, spins down | May have cold start delays |

### Recommended for Production

- **Vercel Pro**: $20/month for team features
- **Render Starter**: $7/month for always-on service
