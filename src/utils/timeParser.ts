/**
 * Time unit multipliers in milliseconds
 */
const TIME_UNITS: Record<string, number> = {
  s: 1000,               // Second
  m: 60 * 1000,          // Minute
  h: 60 * 60 * 1000,     // Hour
  d: 24 * 60 * 60 * 1000,// Day
  w: 7 * 24 * 60 * 60 * 1000, // Week
  M: 30 * 24 * 60 * 60 * 1000, // Month (approximation)
  y: 365 * 24 * 60 * 60 * 1000 // Year (approximation)
};

/**
 * Parse a time string into milliseconds
 * Examples: "1m" (1 minute), "2h" (2 hours), "3d" (3 days), "1w" (1 week)
 * @param timeString The time string to parse
 * @returns The time in milliseconds, or null if the format is invalid
 */
export function parseTimeString(timeString: string): number | null {
  // Remove any whitespace
  timeString = timeString.trim();
  
  // Match a number followed by a time unit
  const matches = timeString.match(/^(\d+)([smhdwMy])$/);
  
  if (!matches) {
    return null;
  }
  
  const value = parseInt(matches[1], 10);
  const unit = matches[2];
  
  if (!TIME_UNITS[unit]) {
    return null;
  }
  
  return value * TIME_UNITS[unit];
}

/**
 * Format a number of milliseconds into a human-readable string
 * @param ms The number of milliseconds
 * @returns A human-readable time string (e.g. "2 days, 3 hours, 1 minute")
 */
export function formatTime(ms: number): string {
  if (ms <= 0) {
    return 'now';
  }
  
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) % 30;
  const months = Math.floor(ms / (1000 * 60 * 60 * 24 * 30)) % 12;
  const years = Math.floor(ms / (1000 * 60 * 60 * 24 * 365));
  
  const parts: string[] = [];
  
  if (years > 0) {
    parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  }
  
  if (months > 0) {
    parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
  }
  
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }
  
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  
  if (seconds > 0 && parts.length === 0) {
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  }
  
  return parts.join(', ');
}

/**
 * Get a Discord-friendly relative time string for a future date
 * @param date The future date
 * @returns A relative time string (e.g. "in 2 hours")
 */
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  
  if (diff <= 0) {
    return 'now';
  }
  
  return `in ${formatTime(diff)}`;
}

/**
 * Converts a duration string into a future Date object
 * @param timeString Duration string (e.g. "1d", "2h")
 * @returns Date object representing the future time, or null if invalid
 */
export function getFutureDate(timeString: string): Date | null {
  const milliseconds = parseTimeString(timeString);
  
  if (milliseconds === null) {
    return null;
  }
  
  const now = new Date();
  return new Date(now.getTime() + milliseconds);
} 