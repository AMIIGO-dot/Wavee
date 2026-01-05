import twilio from 'twilio';
import { normalizeSmsText, estimateSmsSegments } from '../utils/normalizeSmsText';

export class TwilioService {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';

    console.log('[TWILIO DEBUG] Environment variables:', {
      accountSid: accountSid ? `${accountSid.substring(0, 5)}...` : 'MISSING',
      authToken: authToken ? 'SET' : 'MISSING',
      phoneNumber: this.fromNumber || 'MISSING'
    });

    if (!accountSid || !authToken || !this.fromNumber) {
      throw new Error('Missing required Twilio environment variables');
    }

    this.client = twilio(accountSid, authToken);
  }

  /**
   * Send an SMS message
   */
  async sendSMS(to: string, body: string): Promise<void> {
    try {
      // Normalize text for SMS (GSM-7 encoding)
      const normalizedBody = normalizeSmsText(body);
      const segments = estimateSmsSegments(normalizedBody);

      console.log('[TWILIO] Sending SMS:', {
        to,
        originalLength: body.length,
        normalizedLength: normalizedBody.length,
        estimatedSegments: segments,
      });

      const message = await this.client.messages.create({
        body: normalizedBody,
        from: this.fromNumber,
        to: to,
      });

      console.log('[TWILIO] SMS sent:', {
        to: to,
        messageId: message.sid,
        status: message.status,
      });
    } catch (error) {
      console.error('[TWILIO] Error sending SMS:', error);
      throw new Error('Failed to send SMS');
    }
  }

  /**
   * Send opt-in confirmation message
   */
  async sendOptInMessage(to: string): Promise<void> {
    const message = 
      'Reply YES to activate the Outdoor Assistant. For emergencies, contact local rescue services.';
    
    await this.sendSMS(to, message);
    console.log(`[TWILIO] Opt-in message sent to ${to}`);
  }

  /**
   * Send activation confirmation
   */
  async sendActivationMessage(to: string): Promise<void> {
    const message = 
      'WAVEE activated! You got 3 free conversations to test the service. Ask me about navigation, weather, camping, or any topic. Reply MORE to expand any answer.';
    
    await this.sendSMS(to, message);
    console.log(`[TWILIO] Activation confirmation sent to ${to}`);
  }

  /**
   * Validate Twilio webhook signature (security)
   */
  validateRequest(
    signature: string,
    url: string,
    params: Record<string, any>
  ): boolean {
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    return twilio.validateRequest(authToken, signature, url, params);
  }
}
