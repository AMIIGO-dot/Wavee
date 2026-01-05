import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root (one level up from dist/)
const envPath = path.resolve(__dirname, '../.env');
console.log('[DOTENV] Loading from:', envPath);
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('[DOTENV] Error loading .env:', result.error);
} else {
  console.log('[DOTENV] Loaded successfully');
  console.log('[DOTENV] STRIPE_SECRET_KEY present:', !!process.env.STRIPE_SECRET_KEY);
}

import express, { Express, Request, Response, NextFunction } from 'express';
import smsRouter from './routes/sms';
import paymentRouter from './routes/payment';
import authRouter from './routes/auth';
import accountRouter from './routes/account';
import { SessionService } from './services/sessionService';

const app: Express = express();

// Initialize session cleanup job
const sessionService = new SessionService();

// Run cleanup every hour to delete expired sessions (GDPR compliance)
setInterval(async () => {
  try {
    await sessionService.clearExpiredSessions();
    console.log('[CLEANUP] Session cleanup completed');
  } catch (error) {
    console.error('[CLEANUP] Error clearing expired sessions:', error);
  }
}, 60 * 60 * 1000); // Every hour

// Run initial cleanup on startup
sessionService.clearExpiredSessions()
  .then(() => console.log('[CLEANUP] Initial session cleanup completed'))
  .catch(err => console.error('[CLEANUP] Initial cleanup error:', err));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Stripe webhook needs raw body, so we handle it separately
app.use('/api/webhook', express.raw({ type: 'application/json' }));

// Middleware for other routes - increase limit for MMS webhooks (images can be large)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'outdoor-sms-assistant',
  });
});

// SMS routes
app.use('/sms', smsRouter);

// Payment routes
app.use('/api', paymentRouter);

// Auth routes
app.use('/api/auth', authRouter);

// Account routes
app.use('/api/account', accountRouter);

// Root route - serve landing page
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

export default app;
