/**
 * Text utility functions for SMS handling
 */

/**
 * Normalize phone number format
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-numeric characters except +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // Ensure it starts with + for E.164 format
  if (!normalized.startsWith('+')) {
    // Assume US number if no country code
    if (normalized.length === 10) {
      normalized = '+1' + normalized;
    } else if (normalized.length === 11 && normalized.startsWith('1')) {
      normalized = '+' + normalized;
    } else {
      normalized = '+' + normalized;
    }
  }
  
  return normalized;
}

/**
 * Check if message is a YES confirmation
 */
export function isYesConfirmation(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === 'yes' || normalized === 'y' || normalized === 'ja' || normalized === 'j';
}

/**
 * Check if message is a STOP command
 */
export function isStopCommand(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === 'stop' || normalized === 'unsubscribe' || normalized === 'avsluta';
}

/**
 * Check if message is a HELP command
 */
export function isHelpCommand(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === 'help' || normalized === 'hjälp' || normalized === 'info';
}

/**
 * Check if message is a MORE command
 */
export function isMoreCommand(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === 'more' || normalized === 'more info' || normalized === 'tell me more';
}

/**
 * Check if message is a WHERE AM I / location query command
 */
export function isLocationQueryCommand(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === 'where am i' || 
         normalized === 'where am i?' ||
         normalized === 'var är jag' || 
         normalized === 'var är jag?' ||
         normalized === 'my location' ||
         normalized === 'min position';
}

/**
 * Truncate text to SMS-friendly length (keep under 160 chars per segment)
 */
export function truncateForSMS(text: string, maxLength: number = 1600): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Clean and sanitize user input
 */
export function sanitizeInput(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}
