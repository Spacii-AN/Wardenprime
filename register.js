require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');

// Command registration cooldown management
const COOLDOWN_FILE = '.registration_cooldown';
const COOLDOWN_MINUTES = 5;

function checkCooldown() {
  try {
    if (fs.existsSync(COOLDOWN_FILE)) {
      const data = fs.readFileSync(COOLDOWN_FILE, 'utf8');
      const lastRegistration = new Date(data);
      const now = new Date();
      const diffMinutes = (now - lastRegistration) / (1000 * 60);
      
      if (diffMinutes < COOLDOWN_MINUTES) {
        console.log(`⚠️ Command registration cooldown active. Please wait ${Math.ceil(COOLDOWN_MINUTES - diffMinutes)} more minutes.`);
        console.log(`Last registration: ${lastRegistration.toLocaleString()}`);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error('Error checking cooldown:', error);
    return true; // Allow registration if cooldown check fails
  }
}

function updateCooldown() {
  try {
    fs.writeFileSync(COOLDOWN_FILE, new Date().toISOString());
    console.log('Cooldown updated. Next registration available in 5 minutes.');
  } catch (error) {
    console.error('Error updating cooldown:', error);
  }
}

async function main() {
  try {
    // Check if we're in cooldown period
    if (!checkCooldown()) {
      process.exit(1);
    }
    
    // Load environment variables
    const token = process.env.BOT_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.TEST_GUILD_ID;
    
    if (!token || !clientId) {
      console.error('Missing required environment variables: BOT_TOKEN, CLIENT_ID');
      process.exit(1);
    }
    
    // Create REST instance
    const rest = new REST({ version: '10' }).setToken(token);
    
    // Find all command files
    const commands = [];
    const commandsPath = path.join(__dirname, 'dist', 'commands');
    
    function findCommands(dir) {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const file of files) {
        const filePath = path.join(dir, file.name);
        
        if (file.isDirectory()) {
          findCommands(filePath);
        } else if (file.name.endsWith('.js')) {
          try {
            const command = require(filePath);
            if (command.command && command.command.data) {
              commands.push(command.command.data.toJSON());
              console.log(`Added command: ${command.command.data.name}`);
            }
          } catch (error) {
            console.error(`Error loading command from ${filePath}:`, error);
          }
        }
      }
    }
    
    // Find all commands in the dist directory
    findCommands(commandsPath);
    
    console.log(`Found ${commands.length} commands to register.`);
    
    if (commands.length === 0) {
      console.error('No commands found to register. Make sure to build the project first with npm run build');
      process.exit(1);
    }
    
    // Register commands (guild-only for faster testing)
    console.log('Registering commands...');
    updateCooldown();
    
    if (guildId) {
      console.log(`Registering commands to guild: ${guildId}`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log('Successfully registered guild commands.');
    } else {
      console.log('Registering global commands (this may take up to an hour to propagate)');
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log('Successfully registered global commands.');
    }
    
  } catch (error) {
    console.error('Error during command registration:', error);
    process.exit(1);
  }
}

main(); 