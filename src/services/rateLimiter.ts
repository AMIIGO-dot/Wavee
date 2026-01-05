/**
 * Rate limiting service to prevent abuse
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry>;
  private maxPerMinute: number;
  private maxPerHour: number;
  private maxPerDay: number;

  constructor(
    maxPerMinute: number = 5,
    maxPerHour: number = 30,
    maxPerDay: number = 200
  ) {
    this.limits = new Map();
    this.maxPerMinute = maxPerMinute;
    this.maxPerHour = maxPerHour;
    this.maxPerDay = maxPerDay;

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if request is allowed
   */
  isAllowed(phoneNumber: string, window: 'minute' | 'hour' | 'day'): boolean {
    const key = `${phoneNumber}:${window}`;
    const now = Date.now();
    const entry = this.limits.get(key);

    const windowDuration = this.getWindowDuration(window);
    const maxLimit = this.getMaxLimit(window);

    if (!entry || now > entry.resetAt) {
      // No entry or expired - allow and create new
      this.limits.set(key, {
        count: 1,
        resetAt: now + windowDuration,
      });
      return true;
    }

    if (entry.count >= maxLimit) {
      console.log(`[RATE LIMIT] ${phoneNumber} exceeded ${window} limit (${entry.count}/${maxLimit})`);
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Check all rate limits
   */
  checkLimits(phoneNumber: string): { allowed: boolean; reason?: string } {
    if (!this.isAllowed(phoneNumber, 'minute')) {
      return {
        allowed: false,
        reason: `Du har skickat för många meddelanden. Max ${this.maxPerMinute} per minut.`,
      };
    }

    if (!this.isAllowed(phoneNumber, 'hour')) {
      return {
        allowed: false,
        reason: `Du har skickat för många meddelanden. Max ${this.maxPerHour} per timme.`,
      };
    }

    if (!this.isAllowed(phoneNumber, 'day')) {
      return {
        allowed: false,
        reason: `Du har skickat för många meddelanden. Max ${this.maxPerDay} per dag.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get window duration in milliseconds
   */
  private getWindowDuration(window: 'minute' | 'hour' | 'day'): number {
    switch (window) {
      case 'minute':
        return 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Get max limit for window
   */
  private getMaxLimit(window: 'minute' | 'hour' | 'day'): number {
    switch (window) {
      case 'minute':
        return this.maxPerMinute;
      case 'hour':
        return this.maxPerHour;
      case 'day':
        return this.maxPerDay;
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetAt) {
        this.limits.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[RATE LIMIT] Cleaned up ${removed} expired entries`);
    }
  }

  /**
   * Get current usage for phone number
   */
  getUsage(phoneNumber: string): {
    minute: number;
    hour: number;
    day: number;
  } {
    const now = Date.now();

    const getCount = (window: 'minute' | 'hour' | 'day') => {
      const key = `${phoneNumber}:${window}`;
      const entry = this.limits.get(key);
      return entry && now <= entry.resetAt ? entry.count : 0;
    };

    return {
      minute: getCount('minute'),
      hour: getCount('hour'),
      day: getCount('day'),
    };
  }

  /**
   * Reset limits for phone number (useful for testing)
   */
  reset(phoneNumber: string): void {
    ['minute', 'hour', 'day'].forEach(window => {
      const key = `${phoneNumber}:${window}`;
      this.limits.delete(key);
    });
    console.log(`[RATE LIMIT] Reset limits for ${phoneNumber}`);
  }
}
