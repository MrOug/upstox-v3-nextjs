# Upstox V3 Console - Next.js

> Enterprise-grade stock analysis console built with **Next.js 14**, featuring Upstox V3 API integration, numerology calculations, and advanced charting capabilities.

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Upstox](https://img.shields.io/badge/Upstox-V3_API-orange)](https://upstox.com/developer/)

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/MrOug/upstox-v3-nextjs.git
cd upstox-v3-nextjs

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local with your Upstox credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📊 Features

✅ **OAuth 2.0 Authentication** - Secure server-side token exchange  
✅ **V3 Historical Data** - Proper `/{unit}/{interval}/` format  
✅ **Multiple Data Sources** - Manual, Top 50, Indices, Sectors  
✅ **CSV Export** - Complete data with monthly breakdown  
✅ **Date Patching** - Incorporation date updates  
✅ **Numerology Engine** - Life Path, Personal Year/Month  
✅ **Chinese Zodiac** - Company & monthly zodiac mapping  
✅ **ML Pattern Analysis** - Per-company pattern recognition  
✅ **Dark/Light Theme** - Toggle support  

## 🔧 Configuration

### 1. Get Upstox API Credentials

1. Visit [Upstox Developer Portal](https://upstox.com/developer/)
2. Create a new app
3. Note your **API Key** and **API Secret**

### 2. Update `.env.local`

```env
NEXT_PUBLIC_UPSTOX_API_KEY=your-api-key
UPSTOX_API_SECRET=your-api-secret
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/callback
```

### 3. Configure Upstox App

- Set Redirect URI: `http://localhost:3000/callback`

## 🚀 Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/MrOug/upstox-v3-nextjs)

### Environment Variables

Add in Vercel dashboard:

```
NEXT_PUBLIC_UPSTOX_API_KEY=your-key
UPSTOX_API_SECRET=your-secret
NEXT_PUBLIC_REDIRECT_URI=https://yourdomain.vercel.app/callback
```

## 📁 Project Structure

```
upstox-v3-nextjs/
├── app/
│   ├── api/auth/token/route.ts
│   ├── callback/page.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   └── UpstoxConsole.tsx
├── lib/
│   ├── constants.ts
│   ├── numerology.ts
│   ├── dataProcessing.ts
│   └── upstoxApi.ts
├── package.json
├── next.config.js
└── tsconfig.json
```

## 🔑 API Reference

### Upstox V3 Historical Candles

```
GET /v3/historical-candle/{instrument}/{unit}/{interval}/{to}/{from}
```

**Examples:**
```
/v3/historical-candle/NSE_EQ|INE009A01021/days/1/2024-11-27/2023-11-27
/v3/historical-candle/NSE_EQ|INE009A01021/hours/4/2024-11-27/2024-11-01
```

## 📚 Documentation

- [Upstox V3 API Docs](https://upstox.com/developer/api-documentation/v3/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Setup Guide](./SETUP.md)

## 📄 License

Private use. Comply with Upstox API terms.

---

**🚀 Next.js 14 | 🔒 Secure OAuth | 🎨 Production Ready**