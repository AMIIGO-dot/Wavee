/**
 * Time utility functions
 */

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format date for logging
 */
export function formatLogTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Check if timestamp is older than specified minutes
 */
export function isOlderThan(timestamp: string, minutes: number): boolean {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMinutes = (now.getTime() - date.getTime()) / (1000 * 60);
  return diffMinutes > minutes;
}

/**
 * Get time difference in minutes
 */
export function getMinutesDiff(from: Date, to: Date = new Date()): number {
  return (to.getTime() - from.getTime()) / (1000 * 60);
}
