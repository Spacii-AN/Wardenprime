/**
 * Format a duration in milliseconds into a human-readable string
 * @param ms Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
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
 * Get a relative time string for a future date (e.g., "in 2 hours")
 * @param date The future date
 * @returns A relative time string
 */
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  
  if (diff <= 0) {
    return 'now';
  }
  
  return `in ${formatDuration(diff)}`;
}

/**
 * Get a relative time string for a duration (e.g., "in 2 hours")
 * @param ms Duration in milliseconds
 * @returns A relative time string
 */
export function getRelativeDuration(ms: number): string {
  if (ms <= 0) {
    return 'now';
  }
  
  return `in ${formatDuration(ms)}`;
} 