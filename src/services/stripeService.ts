import Stripe from 'stripe';
import { UserService } from './userService';
import { PRICING_TIERS_SEK, PRICING_TIERS_USD, getPricingTiersForLanguage, getCreditsForTier } from '../config/pricing';

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

export class StripeService {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor() {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new Stripe(apiKey, {
      apiVersion: '2025-12-15.clover',
    });
  }

  /**
   * Create Stripe Checkout Session for user purchase
   */
  async createCheckoutSession(
    phoneNumber: string,
    tierId: 'starter' | 'pro' | 'premium',
    successUrl: string,
    cancelUrl: string,
    language: 'sv' | 'en' = 'sv'
  ): Promise<CheckoutSession> {
    // Get pricing tiers for the user's language
    const pricingTiers = getPricingTiersForLanguage(language);
    const tier = pricingTiers.find(t => t.id === tierId);

    if (!tier) {
      throw new Error('Invalid pricing tier');
    }

    console.log('[STRIPE] Creating checkout session:', {
      phone: phoneNumber,
      tier: tierId,
      language: language,
      price: tier.price,
      currency: tier.currency,
      credits: tier.credits,
    });

    // Check if user already has a Stripe customer
    let customerId: string | undefined;
    const userService = new UserService();
    const user = await userService.getUser(phoneNumber);
    
    if (user?.stripe_customer_id) {
      // Verify customer exists (might be from test mode)
      try {
        await this.stripe.customers.retrieve(user.stripe_customer_id);
        customerId = user.stripe_customer_id;
        console.log('[STRIPE] Using existing customer:', customerId);
      } catch (err) {
        console.log('[STRIPE] Customer not found (likely test mode), creating new:', user.stripe_customer_id);
        customerId = undefined; // Force creation of new customer
      }
    }
    
    if (!customerId) {
      // Create new Stripe customer
      const customer = await this.stripe.customers.create({
        phone: phoneNumber,
        metadata: {
          phone_number: phoneNumber,
        },
      });
      customerId = customer.id;

      console.log('[STRIPE] Created new customer:', customerId);
    }

    // Create checkout session
    const productName = language === 'en' 
      ? `${tier.name} - ${tier.credits} messages`
      : `${tier.name} - ${tier.credits} meddelanden`;
    
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: tier.currency,
            product_data: {
              name: productName,
              description: tier.features.join(', '),
            },
            unit_amount: tier.price * 100, // Convert to cents (SEK öre or USD cents)
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        phone_number: phoneNumber,
        pricing_tier: tierId,
        credits: tier.credits.toString(),
        language: language,
        currency: tier.currency,
      },
    });

    console.log('[STRIPE] Checkout session created:', session.id);

    return {
      sessionId: session.id,
      url: session.url!,
    };
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<void> {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );
    } catch (err: any) {
      console.error('[STRIPE] Webhook signature verification failed:', err.message);
      throw new Error('Invalid webhook signature');
    }

    console.log('[STRIPE] Webhook event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'payment_intent.succeeded':
        console.log('[STRIPE] Payment succeeded:', event.data.object);
        break;

      case 'payment_intent.payment_failed':
        console.log('[STRIPE] Payment failed:', event.data.object);
        break;

      default:
        console.log('[STRIPE] Unhandled event type:', event.type);
    }
  }

  /**
   * Handle successful checkout completion
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const phoneNumber = session.metadata?.phone_number;
    const tierId = session.metadata?.pricing_tier as 'basic' | 'pro' | 'unlimited';
    const credits = parseInt(session.metadata?.credits || '0');
    const customerId = session.customer as string;

    if (!phoneNumber || !tierId) {
      console.error('[STRIPE] Missing metadata in checkout session:', session.id);
      return;
    }

    console.log('[STRIPE] Processing completed checkout:', {
      phone: phoneNumber,
      tier: tierId,
      credits,
      customerId,
    });

    try {
      // Check if user exists
      const userService = new UserService();
      let user = await userService.getUser(phoneNumber);

      if (!user) {
        // Create new user with PENDING status
        await userService.createUser(phoneNumber);
        user = await userService.getUser(phoneNumber);
      }

      // Update user with credits and Stripe info
      await userService.addCredits(phoneNumber, credits);
      await userService.updateStripeCustomer(phoneNumber, customerId, tierId);

      // Log transaction
      await userService.logTransaction(
        phoneNumber,
        'purchase',
        credits,
        `Purchased ${tierId} plan`,
        session.payment_intent as string
      );

      // If user is new (pending), send SMS opt-in
      if (user?.status === 'pending') {
        const { TwilioService } = await import('./twilioService');
        const twilioService = new TwilioService();
        
        await twilioService.sendOptInMessage(phoneNumber);
        
        console.log('[STRIPE] Sent opt-in SMS to new user:', phoneNumber);
      } else {
        // Existing user, just send confirmation
        const { TwilioService } = await import('./twilioService');
        const twilioService = new TwilioService();
        
        const message = `Tack för ditt köp! Du har nu ${credits} nya meddelanden. Ditt saldo: ${user!.credits_remaining + credits} meddelanden.`;
        await twilioService.sendSMS(phoneNumber, message);
        
        console.log('[STRIPE] Sent purchase confirmation to:', phoneNumber);
      }
    } catch (error) {
      console.error('[STRIPE] Error processing checkout:', error);
      throw error;
    }
  }

  /**
   * Create customer portal session for subscription management
   */
  async createPortalSession(
    phoneNumber: string,
    returnUrl: string
  ): Promise<string> {
    const userService = new UserService();
    const user = await userService.getUser(phoneNumber);

    if (!user?.stripe_customer_id) {
      throw new Error('User has no Stripe customer');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: returnUrl,
    });

    return session.url;
  }
}
