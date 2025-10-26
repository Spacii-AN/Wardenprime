import { Client, Guild, User, GuildMember } from 'discord.js';
import { logger } from './logger';

/**
 * Gets the server nickname for a user, falling back to display name or username
 * @param client Discord client
 * @param guildId Guild ID to get the nickname from
 * @param userId User ID to get nickname for
 * @returns The server nickname, display name, or username (in that order of preference)
 */
export async function getServerNickname(client: Client, guildId: string, userId: string): Promise<string> {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      logger.warn(`Guild ${guildId} not found when getting nickname for user ${userId}`);
      return await getFallbackName(client, userId);
    }

    const member = await guild.members.fetch(userId).catch((): null => null);
    if (!member) {
      logger.warn(`Member ${userId} not found in guild ${guildId} when getting nickname`);
      return await getFallbackName(client, userId);
    }

    // Return server nickname if it exists, otherwise display name, otherwise username
    return member.nickname || member.displayName || member.user.username;
  } catch (error) {
    logger.error(`Error getting server nickname for user ${userId} in guild ${guildId}:`, error);
    return await getFallbackName(client, userId);
  }
}

/**
 * Gets the fallback name when server nickname is not available
 * @param client Discord client
 * @param userId User ID
 * @returns Display name or username
 */
async function getFallbackName(client: Client, userId: string): Promise<string> {
  try {
    const user = await client.users.fetch(userId);
    return user.displayName || user.username;
  } catch (error) {
    logger.error(`Error getting fallback name for user ${userId}:`, error);
    return `User ${userId}`;
  }
}

/**
 * Gets server nicknames for multiple users
 * @param client Discord client
 * @param guildId Guild ID
 * @param userIds Array of user IDs
 * @returns Array of nicknames in the same order as userIds
 */
export async function getServerNicknames(client: Client, guildId: string, userIds: string[]): Promise<string[]> {
  const nicknames: string[] = [];
  
  for (const userId of userIds) {
    const nickname = await getServerNickname(client, guildId, userId);
    nicknames.push(nickname);
  }
  
  return nicknames;
}

/**
 * Formats a list of user mentions with their server nicknames
 * @param client Discord client
 * @param guildId Guild ID
 * @param userIds Array of user IDs
 * @returns Formatted string with mentions and nicknames
 */
export async function formatUserMentionsWithNicknames(client: Client, guildId: string, userIds: string[]): Promise<string> {
  const nicknames = await getServerNicknames(client, guildId, userIds);
  
  return userIds.map((userId, index) => {
    const nickname = nicknames[index];
    return `<@${userId}> (${nickname})`;
  }).join(', ');
}

/**
 * Gets the server nickname for a user from a GuildMember object (more efficient)
 * @param member GuildMember object
 * @returns The server nickname, display name, or username
 */
export function getNicknameFromMember(member: GuildMember): string {
  return member.nickname || member.displayName || member.user.username;
}
