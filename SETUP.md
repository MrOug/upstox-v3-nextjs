# Complete Setup Guide - Upstox V3 Console (Next.js)

## 🚦 Current Status

✅ **All files uploaded to GitHub!**  
✅ Branch: `nextjs-v3-console`  
✅ Repository: [MrOug/Share](https://github.com/MrOug/Share/tree/nextjs-v3-console)  

## 💻 Local Development Setup

### Step 1: Clone Repository

```bash
# Clone your repository
git clone https://github.com/MrOug/Share.git
cd Share

# Switch to Next.js branch
git checkout nextjs-v3-console
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install:
- Next.js 14
- React 18
- TypeScript
- Axios (API calls)
- Pako (compression)
- Chart.js + Financial plugin
- PapaParse (CSV parsing)

### Step 3: Get Upstox Credentials

1. Go to: https://upstox.com/developer/
2. Click **"My Apps"** → **"Create App"**
3. Fill in details:
   - **App Name**: Upstox V3 Console
   - **Redirect URI**: `http://localhost:3000/callback`
   - **App Type**: Web
4. Save and note:
   - **API Key** (Client ID)
   - **API Secret** (Client Secret)

### Step 4: Configure Environment

```bash
# Create environment file
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_UPSTOX_API_KEY=your-actual-api-key-here
UPSTOX_API_SECRET=your-actual-api-secret-here
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/callback
```

⚠️ **Important**: Never commit `.env.local` to git!

### Step 5: Run Development Server

```bash
npm run dev
```

Open browser: http://localhost:3000

### Step 6: Test Authentication

1. Click **[AUTH]** button
2. Allow popup window
3. Login to Upstox
4. Authorize the app
5. Check for "✓ Authenticated" status

## 🚀 Production Deployment (Vercel)

### Method 1: Vercel GitHub Integration (Recommended)

#### Step 1: Push to GitHub
```bash
# Already done! Your code is at:
# https://github.com/MrOug/Share/tree/nextjs-v3-console
```

#### Step 2: Deploy to Vercel

1. Go to: https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select **"MrOug/Share"**
4. **Important**: Select branch **`nextjs-v3-console`**
5. Click **"Import"**

#### Step 3: Configure Environment Variables

In Vercel project settings:

1. Go to **Settings** → **Environment Variables**
2. Add three variables:

```
Key: NEXT_PUBLIC_UPSTOX_API_KEY
Value: your-actual-api-key

Key: UPSTOX_API_SECRET  
Value: your-actual-api-secret

Key: NEXT_PUBLIC_REDIRECT_URI
Value: https://your-project.vercel.app/callback
```

⚠️ Replace `your-project.vercel.app` with your actual Vercel domain!

#### Step 4: Update Upstox App Settings

1. Go back to: https://upstox.com/developer/
2. Edit your app
3. **Update Redirect URI** to: `https://your-project.vercel.app/callback`
4. Save changes

#### Step 5: Deploy

1. Click **"Deploy"** in Vercel
2. Wait for build to complete (∼2-3 minutes)
3. Visit your deployed site!

### Method 2: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod

# Follow prompts and set environment variables
```

## 📚 Project Structure Explained

```
nextjs-v3-console/
├── app/                      # Next.js App Router
│   ├── api/
│   │   └── auth/token/
│   │       └── route.ts      # 🔑 OAuth token exchange (server-side)
│   ├── callback/
│   │   └── page.tsx       # 🔄 OAuth callback handler
│   ├── layout.tsx         # 🎨 Root layout (fonts, scripts)
│   ├── page.tsx           # 🏗️ Entry point
│   └── globals.css        # 🎨 Complete styling (exact original)
├── components/
│   └── UpstoxConsole.tsx  # 📦 Main component (all features)
├── lib/
│   ├── upstoxApi.ts       # 🔌 API service (V3 format)
│   ├── numerology.ts      # 🔮 Numerology + Chinese Zodiac
│   ├── dataProcessing.ts  # 📊 CSV parsing & processing
│   └── constants.ts       # 📍 Instruments, dates, names
├── package.json           # 📦 Dependencies
├── next.config.js         # ⚙️ Next.js config (CORS headers)
├── tsconfig.json          # 🔵 TypeScript config
└── .env.local.example     # 🔐 Environment template
```

## ✅ Features Implemented

### 1. Authentication
- ✅ OAuth 2.0 flow with Upstox
- ✅ Server-side token exchange
- ✅ Popup-based login
- ✅ Session management

### 2. Data Fetching
- ✅ V3 API format (`/unit/interval/`)
- ✅ Manual symbol entry
- ✅ Top 50 stocks
- ✅ Index constituents (Nifty 50, Bank Nifty, etc.)
- ✅ Sector-based selection
- ✅ MAX history support (2008/2022)
- ✅ Rate limiting (300ms)

### 3. CSV Processing
- ✅ Export stock data
- ✅ Date patching
- ✅ Numerology calculations
- ✅ ML pattern analysis
- ✅ Preserve file structure

### 4. Visualization
- ✅ Stock cards with metrics
- ✅ Monthly breakdown tables
- ✅ Chart generation (TradingView style)
- ✅ Dark/Light theme toggle

### 5. Security
- ✅ No client-side secrets
- ✅ Server-side OAuth
- ✅ Environment variables
- ✅ Token expiry handling

## 🐛 Common Issues & Solutions

### Issue: "Module not found" errors

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: Environment variables not working

**Solution:**
1. Restart dev server: `npm run dev`
2. Check `.env.local` exists (not `.env.local.example`)
3. Verify no quotes around values
4. Ensure `NEXT_PUBLIC_` prefix for client-side vars

### Issue: "Popup blocked" during auth

**Solution:**
1. Allow popups for localhost
2. Try different browser
3. Use browser's popup settings

### Issue: API returns 401 Unauthorized

**Solution:**
1. Check token hasn't expired (24hr limit)
2. Re-authenticate via [AUTH] button
3. Verify API credentials in `.env.local`

### Issue: CORS errors in production

**Solution:**
1. Check `next.config.js` has CORS headers
2. Verify Redirect URI matches exactly
3. Ensure using HTTPS in production

## 📝 Next Steps After Setup

1. **Test locally** with a few stocks
2. **Test all features**:
   - Data fetching
   - CSV export
   - Date patching
   - Numerology
   - ML analysis
   - Charts
3. **Deploy to Vercel**
4. **Test production** deployment
5. **Share with team** (if applicable)

## 🔗 Useful Links

- **Your GitHub Repo**: https://github.com/MrOug/Share/tree/nextjs-v3-console
- **Upstox Developer Portal**: https://upstox.com/developer/
- **Upstox V3 API Docs**: https://upstox.com/developer/api-documentation/v3/
- **Next.js Documentation**: https://nextjs.org/docs
- **Vercel Dashboard**: https://vercel.com/dashboard

## ❓ Need Help?

1. Check the logs in browser console (F12)
2. Check terminal output for errors
3. Review Upstox API documentation
4. Check GitHub Issues (if any)

---

**✅ Setup Complete! You're ready to use the Upstox V3 Console!**