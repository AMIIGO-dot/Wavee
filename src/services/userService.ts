import { getDatabase, User } from '../db/database';

export class UserService {
  private db = getDatabase();

  /**
   * Get user by phone number
   */
  async getUser(phoneNumber: string): Promise<User | undefined> {
    return await this.db.get<User>(
      'SELECT * FROM users WHERE phone_number = ?',
      [phoneNumber]
    );
  }

  /**
   * Create a new user with pending status
   */
  async createUser(phoneNumber: string, options?: {
    password_hash?: string;
    google_id?: string;
    email?: string;
    status?: 'pending' | 'active' | 'inactive';
    language?: 'sv' | 'en';
    twilio_number?: string;
  }): Promise<void> {
    const status = options?.status || 'pending';
    const language = options?.language || 'sv';
    const twilioNumber = options?.twilio_number || null;
    await this.db.run(
      'INSERT INTO users (phone_number, status, password_hash, google_id, email, language, twilio_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [phoneNumber, status, options?.password_hash || null, options?.google_id || null, options?.email || null, language, twilioNumber]
    );
    console.log(`[USER] Created new ${status} user: ${phoneNumber} (language: ${language})`);
  }

  /**
   * Update user data
   */
  async updateUser(phoneNumber: string, updates: {
    password_hash?: string;
    email?: string;
    ai_tone?: 'casual' | 'professional' | 'friendly';
    status?: 'pending' | 'active' | 'inactive';
  }): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.password_hash !== undefined) {
      fields.push('password_hash = ?');
      values.push(updates.password_hash);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.ai_tone !== undefined) {
      fields.push('ai_tone = ?');
      values.push(updates.ai_tone);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(phoneNumber);

    await this.db.run(
      `UPDATE users SET ${fields.join(', ')} WHERE phone_number = ?`,
      values
    );
    console.log(`[USER] Updated user: ${phoneNumber}`);
  }

  /**
   * Get user by Google ID
   */
  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return await this.db.get<User>(
      'SELECT * FROM users WHERE google_id = ?',
      [googleId]
    );
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | undefined> {
    return await this.db.get<User>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
  }

  /**
   * Activate a pending user
   */
  async activateUser(phoneNumber: string): Promise<void> {
    await this.db.run(
      'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?',
      ['active', phoneNumber]
    );
    console.log(`[USER] Activated user: ${phoneNumber}`);
  }

  /**
   * Check if user is active
   */
  async isUserActive(phoneNumber: string): Promise<boolean> {
    const user = await this.getUser(phoneNumber);
    return user?.status === 'active';
  }

  /**
   * Check if user is pending activation
   */
  async isUserPending(phoneNumber: string): Promise<boolean> {
    const user = await this.getUser(phoneNumber);
    return user?.status === 'pending';
  }

  /**
   * Check if user exists
   */
  async userExists(phoneNumber: string): Promise<boolean> {
    const user = await this.getUser(phoneNumber);
    return user !== undefined;
  }

  /**
   * Add credits to user account
   */
  async addCredits(phoneNumber: string, credits: number): Promise<void> {
    await this.db.run(
      'UPDATE users SET credits_remaining = credits_remaining + ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?',
      [credits, phoneNumber]
    );
    console.log(`[USER] Added ${credits} credits to ${phoneNumber}`);
  }

  /**
   * Deduct credits from user account
   */
  async deductCredits(phoneNumber: string, credits: number): Promise<boolean> {
    const user = await this.getUser(phoneNumber);
    
    if (!user || user.credits_remaining < credits) {
      return false; // Insufficient credits
    }

    await this.db.run(
      'UPDATE users SET credits_remaining = credits_remaining - ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?',
      [credits, phoneNumber]
    );
    
    console.log(`[USER] Deducted ${credits} credits from ${phoneNumber}, remaining: ${user.credits_remaining - credits}`);
    return true;
  }

  /**
   * Check if user has enough credits
   */
  async hasCredits(phoneNumber: string, required: number = 1): Promise<boolean> {
    const user = await this.getUser(phoneNumber);
    return user ? user.credits_remaining >= required : false;
  }

  /**
   * Update Stripe customer information
   */
  async updateStripeCustomer(
    phoneNumber: string,
    customerId: string,
    tier: 'basic' | 'pro' | 'unlimited'
  ): Promise<void> {
    await this.db.run(
      'UPDATE users SET stripe_customer_id = ?, pricing_tier = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?',
      [customerId, tier, phoneNumber]
    );
    console.log(`[USER] Updated Stripe customer for ${phoneNumber}: ${customerId}, tier: ${tier}`);
  }

  /**
   * Log consent timestamp
   */
  async logConsent(phoneNumber: string): Promise<void> {
    await this.db.run(
      'UPDATE users SET consent_timestamp = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?',
      [phoneNumber]
    );
    console.log(`[USER] Logged consent for ${phoneNumber}`);
  }

  /**
   * Log transaction (purchase, usage, refund)
   */
  async logTransaction(
    phoneNumber: string,
    type: 'purchase' | 'usage' | 'refund',
    creditsDelta: number,
    description?: string,
    stripePaymentId?: string
  ): Promise<void> {
    await this.db.run(
      'INSERT INTO transactions (phone_number, type, credits_delta, description, stripe_payment_id) VALUES (?, ?, ?, ?, ?)',
      [phoneNumber, type, creditsDelta, description || null, stripePaymentId || null]
    );
    console.log(`[TRANSACTION] ${type}: ${phoneNumber}, delta: ${creditsDelta}`);
  }

  /**
   * Deactivate user (e.g., STOP command)
   */
  async deactivateUser(phoneNumber: string): Promise<void> {
    await this.db.run(
      'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?',
      ['inactive', phoneNumber]
    );
    console.log(`[USER] Deactivated user: ${phoneNumber}`);
  }

  /**
   * Get user's transaction history
   */
  async getTransactions(phoneNumber: string, limit: number = 50): Promise<any[]> {
    return await this.db.all(
      'SELECT * FROM transactions WHERE phone_number = ? ORDER BY created_at DESC LIMIT ?',
      [phoneNumber, limit]
    );
  }

  /**
   * Get user's selected categories
   */
  async getSelectedCategories(phoneNumber: string): Promise<string[]> {
    const user = await this.getUser(phoneNumber);
    if (!user || !user.selected_categories) {
      return ['outdoor']; // Default to outdoor category
    }
    try {
      return JSON.parse(user.selected_categories);
    } catch (error) {
      console.error('[USER] Error parsing selected_categories:', error);
      return ['outdoor'];
    }
  }

  /**
   * Update user's selected categories
   */
  async updateSelectedCategories(phoneNumber: string, categories: string[]): Promise<void> {
    await this.db.run(
      'UPDATE users SET selected_categories = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?',
      [JSON.stringify(categories), phoneNumber]
    );
    console.log(`[USER] Updated categories for ${phoneNumber}:`, categories);
  }

  /**
   * Get maximum categories allowed for user based on their tier
   */
  async getMaxCategoriesForUser(phoneNumber: string): Promise<number> {
    const user = await this.getUser(phoneNumber);
    if (!user || !user.pricing_tier) {
      return 1; // Default to starter limit
    }
    
    const tierLimits: Record<string, number> = {
      starter: 1,
      pro: 3,
      premium: 999,
      basic: 1,
      unlimited: 999,
    };
    
    return tierLimits[user.pricing_tier] || 1;
  }

  /**
   * Set user's preferred language
   */
  async setLanguage(phoneNumber: string, language: 'sv' | 'en'): Promise<void> {
    await this.db.run(
      'UPDATE users SET language = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?',
      [language, phoneNumber]
    );
    console.log(`[USER] Set language for ${phoneNumber}: ${language}`);
  }

  /**
   * Get user's preferred language
   */
  async getLanguage(phoneNumber: string): Promise<'sv' | 'en'> {
    const user = await this.getUser(phoneNumber);
    return user?.language || 'sv';
  }

  /**
   * Set user's Twilio number (which number they messaged)
   */
  async setTwilioNumber(phoneNumber: string, twilioNumber: string): Promise<void> {
    await this.db.run(
      'UPDATE users SET twilio_number = ?, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?',
      [twilioNumber, phoneNumber]
    );
  }
}
