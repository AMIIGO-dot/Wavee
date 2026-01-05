import { Router, Request, Response } from 'express';
import { StripeService } from '../services/stripeService';

const router = Router();

/**
 * POST /api/checkout
 * Create Stripe Checkout session
 */
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    console.log('[CHECKOUT] Environment check:', {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? 'SET' : 'NOT SET',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'NOT SET',
    });

    const { phoneNumber, tier, language } = req.body;

    console.log('[CHECKOUT] Request body:', { phoneNumber, tier, language });

    if (!phoneNumber || !tier) {
      return res.status(400).json({ error: 'Missing phoneNumber or tier' });
    }
    
    // Default to Swedish if language not provided
    const userLanguage = language === 'en' ? 'en' : 'sv';
    
    console.log('[CHECKOUT] Using language:', userLanguage);

    if (!['starter', 'pro', 'premium'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Validate phone number format
    if (!phoneNumber.match(/^\+[1-9]\d{10,14}$/)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const stripeService = new StripeService();

    const baseUrl = process.env.BASE_URL || `http://localhost:3000`;
    const session = await stripeService.createCheckoutSession(
      phoneNumber,
      tier,
      `${baseUrl}/success.html`,
      `${baseUrl}/`,
      userLanguage
    );

    console.log('[CHECKOUT] Session created:', {
      phone: phoneNumber,
      tier,
      sessionId: session.sessionId,
    });

    res.json({
      sessionId: session.sessionId,
      url: session.url,
    });
  } catch (error: any) {
    console.error('[CHECKOUT] Error:', error);
    console.error('[CHECKOUT] Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/webhook
 * Handle Stripe webhooks
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    return res.status(400).send('Missing stripe-signature header');
  }

  try {
    const stripeService = new StripeService();
    
    // Stripe needs raw body, not parsed JSON
    const rawBody = req.body;
    
    await stripeService.handleWebhook(rawBody, signature);

    res.json({ received: true });
  } catch (error: any) {
    console.error('[WEBHOOK] Error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

export default router;
