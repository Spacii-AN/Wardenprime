import { Guild, GuildMember, Role } from 'discord.js';
import { pgdb } from './postgresDatabase';
import { logger } from '../utils/logger';

// Permission roles that can be configured per guild
export enum PermissionRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  SCHEDULER = 'scheduler',
  LOGGER = 'logger'
}

// Interface for storing guild permission roles
interface GuildPermissionRoles {
  guildId: string;
  roles: {
    [key in PermissionRole]?: string[]; // Array of role IDs
  };
  updatedAt: string;
}

/**
 * Check if a member has a specific permission role
 * @param member Guild member to check
 * @param role Permission role to check for
 * @returns true if the member has the role, false otherwise
 */
export async function hasPermissionRole(member: GuildMember, role: PermissionRole): Promise<boolean> {
  try {
    // If they're the server owner, they have all permissions
    if (member.guild.ownerId === member.id) {
      return true;
    }
    
    // Get guild permissions from database
    const guildPerms = await getGuildPermissionRoles(member.guild.id);
    
    // If no custom roles are set for this permission type
    if (!guildPerms.roles[role] || guildPerms.roles[role]!.length === 0) {
      // Default to Discord's built-in permissions for basic roles
      switch (role) {
        case PermissionRole.ADMIN:
          return member.permissions.has('Administrator');
        case PermissionRole.MODERATOR:
          return member.permissions.has('KickMembers') || member.permissions.has('BanMembers');
        default:
          return member.permissions.has('Administrator');
      }
    }
    
    // Check if the member has any of the required roles
    const memberRoleIds = member.roles.cache.map(r => r.id);
    return guildPerms.roles[role]!.some(roleId => memberRoleIds.includes(roleId));
  } catch (error) {
    logger.error(`Error checking permission role for member ${member.id}:`, error);
    // Default to false on error
    return false;
  }
}

/**
 * Check if a member is a moderator or admin
 * @param member Guild member to check
 * @returns true if the member is a moderator or admin, false otherwise
 */
export async function isModerator(member: GuildMember): Promise<boolean> {
  return await hasPermissionRole(member, PermissionRole.ADMIN) || 
         await hasPermissionRole(member, PermissionRole.MODERATOR);
}

/**
 * Check if a member is an admin
 * @param member Guild member to check
 * @returns true if the member is an admin, false otherwise
 */
export async function isAdmin(member: GuildMember): Promise<boolean> {
  return await hasPermissionRole(member, PermissionRole.ADMIN);
}

/**
 * Get all permission roles for a guild
 * @param guildId ID of the guild
 * @returns Object with all permission roles
 */
export async function getGuildPermissionRoles(guildId: string): Promise<GuildPermissionRoles> {
  try {
    if (!pgdb) {
      throw new Error('Database not available');
    }
    
    // Try to get existing permission roles from database
    const query = 'SELECT * FROM guild_permission_roles WHERE guild_id = $1';
    const result = await pgdb.query<{guild_id: string, roles: any, updated_at: Date}>(query, [guildId]);
    
    if (result.length > 0) {
      // Convert from DB format to our interface
      return {
        guildId: result[0].guild_id,
        roles: result[0].roles,
        updatedAt: result[0].updated_at.toISOString()
      };
    }
    
    // If no permissions found, create a default entry
    const defaultPerms: GuildPermissionRoles = {
      guildId,
      roles: {},
      updatedAt: new Date().toISOString()
    };
    
    // Add default entry to database
    if (!pgdb) {
      throw new Error('Database not available');
    }
    
    await pgdb.query(
      'INSERT INTO guild_permission_roles (guild_id, roles, created_at, updated_at) VALUES ($1, $2, $3, $3)',
      [guildId, defaultPerms.roles, new Date()]
    );
    
    return defaultPerms;
  } catch (error) {
    logger.error(`Error getting permission roles for guild ${guildId}:`, error);
    // Return default on error
    return {
      guildId,
      roles: {},
      updatedAt: new Date().toISOString()
    };
  }
}

/**
 * Add a role to a permission category
 * @param guildId ID of the guild
 * @param permRole Permission role category
 * @param roleId ID of the role to add
 * @returns true if successful, false otherwise
 */
export async function addPermissionRole(
  guildId: string, 
  permRole: PermissionRole, 
  roleId: string
): Promise<boolean> {
  try {
    // Get existing permission roles
    const guildPerms = await getGuildPermissionRoles(guildId);
    
    // Initialize the roles array if it doesn't exist
    if (!guildPerms.roles[permRole]) {
      guildPerms.roles[permRole] = [];
    }
    
    // Add the role if it's not already in the array
    if (!guildPerms.roles[permRole]!.includes(roleId)) {
      guildPerms.roles[permRole]!.push(roleId);
    }
    
    // Update in database
    guildPerms.updatedAt = new Date().toISOString();
    const now = new Date();
    
    // Check if the record exists and update or insert accordingly
    if (!pgdb) {
      throw new Error('Database not available');
    }
    
    const checkQuery = 'SELECT 1 FROM guild_permission_roles WHERE guild_id = $1';
    const checkResult = await pgdb.query(checkQuery, [guildId]);
    
    if (checkResult.length > 0) {
      // Update existing record
      await pgdb.query(
        'UPDATE guild_permission_roles SET roles = $1, updated_at = $2 WHERE guild_id = $3',
        [guildPerms.roles, now, guildId]
      );
    } else {
      // Insert new record
      await pgdb.query(
        'INSERT INTO guild_permission_roles (guild_id, roles, created_at, updated_at) VALUES ($1, $2, $3, $3)',
        [guildId, guildPerms.roles, now]
      );
    }
    
    return true;
  } catch (error) {
    logger.error(`Error adding permission role for guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Remove a role from a permission category
 * @param guildId ID of the guild
 * @param permRole Permission role category
 * @param roleId ID of the role to remove
 * @returns true if successful, false otherwise
 */
export async function removePermissionRole(
  guildId: string, 
  permRole: PermissionRole, 
  roleId: string
): Promise<boolean> {
  try {
    // Get existing permission roles
    const guildPerms = await getGuildPermissionRoles(guildId);
    
    // If the role array doesn't exist or the role isn't in it, nothing to do
    if (!guildPerms.roles[permRole] || !guildPerms.roles[permRole]!.includes(roleId)) {
      return true;
    }
    
    // Remove the role
    guildPerms.roles[permRole] = guildPerms.roles[permRole]!.filter(id => id !== roleId);
    
    // Update in database
    guildPerms.updatedAt = new Date().toISOString();
    const now = new Date();
    
    if (!pgdb) {
      throw new Error('Database not available');
    }
    
    await pgdb.query(
      'UPDATE guild_permission_roles SET roles = $1, updated_at = $2 WHERE guild_id = $3',
      [guildPerms.roles, now, guildId]
    );
    
    return true;
  } catch (error) {
    logger.error(`Error removing permission role for guild ${guildId}:`, error);
    return false;
  }
}

/**
 * Set all roles for a permission category
 * @param guildId ID of the guild
 * @param permRole Permission role category
 * @param roleIds Array of role IDs
 * @returns true if successful, false otherwise
 */
export async function setPermissionRoles(
  guildId: string, 
  permRole: PermissionRole, 
  roleIds: string[]
): Promise<boolean> {
  try {
    // Get existing permission roles
    const guildPerms = await getGuildPermissionRoles(guildId);
    
    // Set the roles array
    guildPerms.roles[permRole] = [...roleIds];
    
    // Update in database
    guildPerms.updatedAt = new Date().toISOString();
    const now = new Date();
    
    if (!pgdb) {
      throw new Error('Database not available');
    }
    
    await pgdb.query(
      'UPDATE guild_permission_roles SET roles = $1, updated_at = $2 WHERE guild_id = $3',
      [guildPerms.roles, now, guildId]
    );
    
    return true;
  } catch (error) {
    logger.error(`Error setting permission roles for guild ${guildId}:`, error);
    return false;
  }
} 