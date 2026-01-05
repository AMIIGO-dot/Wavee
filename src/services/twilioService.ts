import twilio from 'twilio';
import { normalizeSmsText, estimateSmsSegments } from '../utils/normalizeSmsText';

export class TwilioService {
  private client: twilio.Twilio;
  private fromNumberSE: string;
  private fromNumberUS: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumberSE = process.env.TWILIO_PHONE_NUMBER_SE || process.env.TWILIO_PHONE_NUMBER || '';
    this.fromNumberUS = process.env.TWILIO_PHONE_NUMBER_US || '';

    console.log('[TWILIO DEBUG] Environment variables:', {
      accountSid: accountSid ? `${accountSid.substring(0, 5)}...` : 'MISSING',
      authToken: authToken ? 'SET' : 'MISSING',
      phoneNumberSE: this.fromNumberSE || 'MISSING',
      phoneNumberUS: this.fromNumberUS || 'MISSING'
    });

    if (!accountSid || !authToken || !this.fromNumberSE) {
      throw new Error('Missing required Twilio environment variables');
    }

    this.client = twilio(accountSid, authToken);
  }

  /**
   * Get the appropriate Twilio number for a language
   */
  private getFromNumber(language: 'sv' | 'en'): string {
    return language === 'en' && this.fromNumberUS ? this.fromNumberUS : this.fromNumberSE;
  }

  /**
   * Send an SMS message
   */
  async sendSMS(to: string, body: string, language: 'sv' | 'en' = 'sv'): Promise<void> {
    try {
      // Normalize text for SMS (GSM-7 encoding)
      const normalizedBody = normalizeSmsText(body);
      const segments = estimateSmsSegments(normalizedBody);
      const fromNumber = this.getFromNumber(language);

      console.log('[TWILIO] Sending SMS:', {
        to,
        from: fromNumber,
        language,
        originalLength: body.length,
        normalizedLength: normalizedBody.length,
        estimatedSegments: segments,
      });

      const message = await this.client.messages.create({
        body: normalizedBody,
        from: fromNumber,
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
  async sendOptInMessage(to: string, language: 'sv' | 'en' = 'sv'): Promise<void> {
    const messages = {
      sv: 'Svara JA for att aktivera WAVEE. Vid nodlage, kontakta lokala radningstjansten.',
      en: 'Reply YES to activate WAVEE. For emergencies, contact local rescue services.'
    };
    
    await this.sendSMS(to, messages[language], language);
    console.log(`[TWILIO] Opt-in message sent to ${to} (${language})`);
  }

  /**
   * Send activation confirmation
   */
  async sendActivationMessage(to: string, language: 'sv' | 'en' = 'sv'): Promise<void> {
    const messages = {
      sv: 'WAVEE aktiverat! Du fick 3 gratis konversationer for att testa tjansten. Fraga om navigering, vader, camping eller andra amnen. Svara MORE for mer info.',
      en: 'WAVEE activated! You got 3 free conversations to test the service. Ask about navigation, weather, camping, or any topic. Reply MORE for more info.'
    };
    
    await this.sendSMS(to, messages[language], language);
    console.log(`[TWILIO] Activation confirmation sent to ${to} (${language})`);
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
