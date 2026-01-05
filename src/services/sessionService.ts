import { getDatabase, Session } from '../db/database';

const SESSION_TIMEOUT_MINUTES = 30;
const MAX_MESSAGES = 3;

export class SessionService {
  private db = getDatabase();

  /**
   * Get the most recent active session for a phone number
   */
  async getSession(phoneNumber: string): Promise<Session | undefined> {
    const session = await this.db.get<Session>(
      `SELECT * FROM sessions 
       WHERE phone_number = ? 
       ORDER BY updated_at DESC 
       LIMIT 1`,
      [phoneNumber]
    );

    // Check if session is expired
    if (session && this.isSessionExpired(session)) {
      console.log(`[SESSION] Session expired for ${phoneNumber}`);
      return undefined;
    }

    return session;
  }

  /**
   * Create a new session
   */
  async createSession(phoneNumber: string, userMessage: string): Promise<Session> {
    const messages = JSON.stringify([userMessage]);
    
    await this.db.run(
      `INSERT INTO sessions (phone_number, messages, last_ai_response) 
       VALUES (?, ?, ?)`,
      [phoneNumber, messages, null]
    );

    const session = await this.getSession(phoneNumber);
    console.log(`[SESSION] Created new session for ${phoneNumber}`);
    return session!;
  }

  /**
   * Update session with new user message and AI response
   */
  async updateSession(
    phoneNumber: string,
    userMessage: string | null,
    aiResponse: string
  ): Promise<void> {
    const session = await this.getSession(phoneNumber);

    if (!session) {
      // Create new session if none exists
      if (userMessage) {
        await this.createSession(phoneNumber, userMessage);
      }
      return;
    }

    // Parse existing messages
    let messages: string[] = JSON.parse(session.messages);

    // Add new user message if provided
    if (userMessage) {
      messages.push(userMessage);
      // Keep only last 3 messages
      if (messages.length > MAX_MESSAGES) {
        messages = messages.slice(-MAX_MESSAGES);
      }
    }

    // Update session
    await this.db.run(
      `UPDATE sessions 
       SET messages = ?, 
           last_ai_response = ?, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [JSON.stringify(messages), aiResponse, session.id]
    );

    console.log(`[SESSION] Updated session for ${phoneNumber}`);
  }

  /**
   * Get conversation context for AI
   */
  async getContext(phoneNumber: string): Promise<{
    messages: string[];
    lastAiResponse: string | null;
  }> {
    const session = await this.getSession(phoneNumber);

    if (!session) {
      return { messages: [], lastAiResponse: null };
    }

    return {
      messages: JSON.parse(session.messages),
      lastAiResponse: session.last_ai_response || null,
    };
  }

  /**
   * Check if session is expired (older than 30 minutes)
   */
  private isSessionExpired(session: Session): boolean {
    const updatedAt = new Date(session.updated_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - updatedAt.getTime()) / (1000 * 60);
    return diffMinutes > SESSION_TIMEOUT_MINUTES;
  }

  /**
   * Clear old sessions (cleanup utility)
   */
  async clearExpiredSessions(): Promise<void> {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - SESSION_TIMEOUT_MINUTES);

    await this.db.run(
      `DELETE FROM sessions WHERE updated_at < ?`,
      [cutoffTime.toISOString()]
    );

    console.log('[SESSION] Cleared expired sessions');
  }

  /**
   * Store user's last known location (for place searches)
   */
  async saveLocation(phoneNumber: string, lat: number, lon: number): Promise<void> {
    const location = JSON.stringify({ lat, lon, timestamp: new Date().toISOString() });
    
    await this.db.run(
      `UPDATE sessions SET last_location = ? WHERE phone_number = ?`,
      [location, phoneNumber]
    );
  }

  /**
   * Get user's last known location (within last 24 hours)
   */
  async getLastLocation(phoneNumber: string): Promise<{ lat: number; lon: number } | null> {
    const session = await this.db.get<{ last_location: string }>(
      `SELECT last_location FROM sessions 
       WHERE phone_number = ? 
       ORDER BY updated_at DESC 
       LIMIT 1`,
      [phoneNumber]
    );

    if (!session || !session.last_location) {
      return null;
    }

    try {
      const location = JSON.parse(session.last_location);
      const timestamp = new Date(location.timestamp);
      const now = new Date();
      const hoursSinceUpdate = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);

      // Location expires after 24 hours
      if (hoursSinceUpdate > 24) {
        return null;
      }

      return { lat: location.lat, lon: location.lon };
    } catch (error) {
      console.error('[SESSION] Error parsing last_location:', error);
      return null;
    }
  }
}
