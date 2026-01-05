# Railway Deployment Guide

## Quick Deploy to Railway.app

### 1. Sign Up & Connect GitHub
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project"
4. Choose "Deploy from GitHub repo"
5. Select `AMIIGO-dot/Wavee` repository

### 2. Configure Environment Variables
In Railway dashboard, add these variables:

**Required:**
```
PORT=3000
NODE_ENV=production

# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER_SE=+46738631761
TWILIO_PHONE_NUMBER_US=+13073183355

# OpenAI
OPENAI_API_KEY=your_openai_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# JWT
JWT_SECRET=your_random_secret_key_here

# Google OAuth (if using)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=https://your-domain.railway.app/api/auth/google/callback
```

### 3. Deploy!
Railway will automatically:
- ✅ Run `npm install`
- ✅ Run `npm run build`
- ✅ Run `npm start`
- ✅ Give you a URL like `https://wavee-production.up.railway.app`

### 4. Update Twilio Webhooks
Once deployed, update your Twilio webhook URLs to:
```
https://your-railway-url.railway.app/sms/incoming
```

### 5. Update Stripe Webhooks
Update your Stripe webhook URL to:
```
https://your-railway-url.railway.app/api/webhook
```

### 6. Custom Domain (Optional)
In Railway dashboard:
1. Go to Settings → Domains
2. Click "Add Domain"
3. Add your domain (e.g., wavee.app)
4. Update DNS records as shown

### 7. Monitor Your App
Railway provides:
- Real-time logs
- Metrics
- Auto-restarts on crashes
- Auto-deploys on git push

## Costs
- $5/month (includes $5 free credit for first month)
- Scales automatically based on usage

## Support
Railway dashboard has excellent logs and metrics to monitor your app!
