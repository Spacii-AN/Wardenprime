const { SlashCommandBuilder } = require('@discordjs/builders');
const RivenParser = require('./rivenparser.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('statranges')
        .setDescription('Shows all possible stat ranges for a Riven mod')
        .addStringOption(option => 
            option.setName('weapon')
                .setDescription('The weapon to check stat ranges for')
                .setRequired(true)),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        // Get weapon name from user input
        const weaponName = interaction.options.getString('weapon');
        
        try {
            // Load necessary data
            const weaponData = await fetchWeaponData(weaponName);
            
            if (!weaponData) {
                return interaction.editReply(`Couldn't find weapon: ${weaponName}`);
            }
            
            // Default settings (same as rivencalc.php defaults)
            const lvl = 8;
            const buffs = 3;
            const curses = 1;
            
            // Calculate and format results
            const statsEmbed = await generateStatsEmbed(weaponData, lvl, buffs, curses);
            
            return interaction.editReply({ embeds: [statsEmbed] });
        } catch (error) {
            console.error('Error in statranges command:', error);
            return interaction.editReply('An error occurred while processing your request.');
        }
    }
};

async function fetchWeaponData(weaponName) {
    try {
        // Fetch weapon data from Warframe export
        const response = await fetch("https://browse.wf/warframe-public-export-plus/ExportWeapons.json");
        const ExportWeapons = await response.json();
        
        // Find weapon by name (case insensitive)
        const weapon = Object.values(ExportWeapons).find(w => 
            (w.name && w.name.toLowerCase() === weaponName.toLowerCase()) || 
            (dict[w.name] && dict[w.name].toLowerCase() === weaponName.toLowerCase())
        );
        
        if (!weapon) return null;
        
        // Determine riven type and omega attenuation
        let rivenType = "LotusRifleRandomModRare";
        if (weapon.productCategory === "Pistols") {
            rivenType = "LotusPistolRandomModRare";
        } else if (weapon.productCategory === "Melee" || weapon.holsterCategory === "MELEE") {
            rivenType = "PlayerMeleeWeaponRandomModRare";
        } else if (weapon.holsterCategory === "SHOTGUN") {
            rivenType = "LotusShotgunRandomModRare";
        } else if ("primeOmegaAttenuation" in weapon) {
            rivenType = "LotusModularPistolRandomModRare";
        } else if (weapon.omegaAttenuation !== 1.0 && !weapon.excludeFromCodex && weapon.totalDamage === 0) {
            rivenType = "LotusModularMeleeRandomModRare";
        } else if (weapon.holsterCategory === "ARCHGUN") {
            rivenType = "LotusArchgunRandomModRare";
        }
        
        return {
            name: dict[weapon.name] || weapon.name,
            rivenType: rivenType,
            omegaAttenuation: weapon.omegaAttenuation || weapon.primeOmegaAttenuation || 1.0,
            data: weapon
        };
    } catch (error) {
        console.error('Error fetching weapon data:', error);
        throw error;
    }
}

async function generateStatsEmbed(weaponData, lvl, buffs, curses) {
    const { EmbedBuilder } = require('discord.js');
    const rivenType = weaponData.rivenType;
    const omegaAttenuation = weaponData.omegaAttenuation;
    
    // Create embed
    const embed = new EmbedBuilder()
        .setTitle(`${weaponData.name} Riven Stat Ranges`)
        .setDescription(`Disposition: ${omegaAttenuation.toFixed(2)}x | Level: ${lvl} | Buffs: ${buffs} | Curses: ${curses}`)
        .setColor('#7851a9'); // Warframe purple
    
    // Get possible stats from RivenParser
    const possibleStats = RivenParser.riven_tags[rivenType];
    
    // Calculate buff ranges
    let buffText = '';
    for (const stat of possibleStats) {
        if (stat.prefix) { // Can be a buff
            const min = getBuffValue(rivenType, stat.tag, 0, omegaAttenuation, lvl, buffs, curses);
            const max = getBuffValue(rivenType, stat.tag, 1, omegaAttenuation, lvl, buffs, curses);
            
            // Check if stat is compatible with weapon
            const isCompatible = isStatCompatibleWithWeapon(stat.tag, weaponData.data);
            const compatMarker = isCompatible ? '' : ' ⓘ';
            
            buffText += `**${formatStatName(stat.tag)}:** ${min.displayValue} to ${max.displayValue}${compatMarker}\n`;
        }
    }
    
    // Calculate curse ranges
    let curseText = '';
    for (const stat of possibleStats) {
        if (stat.tag !== "WeaponMeleeComboBonusOnHitMod") { // Can be a curse
            const min = getCurseValue(rivenType, stat.tag, 0, omegaAttenuation, lvl, buffs, curses);
            const max = getCurseValue(rivenType, stat.tag, 1, omegaAttenuation, lvl, buffs, curses);
            
            // Some stats have reversed display values for curses
            const reverseSymbol = shouldReverseSymbol(stat.tag);
            if (reverseSymbol) {
                min.displayValue *= -1;
                max.displayValue *= -1;
            }
            
            // Check if stat is compatible with weapon
            const isCompatible = isStatCompatibleWithWeapon(stat.tag, weaponData.data, false);
            const compatMarker = isCompatible ? '' : ' ⓘ';
            
            curseText += `**${formatStatName(stat.tag)}:** ${min.displayValue} to ${max.displayValue}${compatMarker}\n`;
        }
    }
    
    // Add fields to embed
    embed.addFields(
        { name: 'Positive Stats', value: buffText || 'None available', inline: true }
    );
    if (curses > 0) {
        embed.addFields(
            { name: 'Negative Stats', value: curseText || 'None available', inline: true }
        );
    }
    
    // Add note for incompatible stats
    if (buffText.includes('ⓘ') || curseText.includes('ⓘ')) {
        embed.setFooter({ text: 'ⓘ This stat cannot currently be rolled on this weapon.' });
    }
    
    return embed;
}

// Helper functions based on rivencalc.php
function getBuffValue(rivenType, tag, tagValue, omegaAttenuation, lvl, buffs, curses) {
    tagValue = RivenParser.floatToRivenInt(tagValue);
    const fingerprint = { lvl, buffs: [], curses: [] };
    do {
        fingerprint.buffs.push({ Tag: tag, Value: tagValue });
    } while (--buffs > 0);
    while (curses-- > 0) {
        fingerprint.curses.push({ Tag: "WeaponCritChanceMod", Value: 0 });
    }
    return RivenParser.parseRiven(rivenType, fingerprint, omegaAttenuation).stats[0];
}

function getCurseValue(rivenType, tag, tagValue, omegaAttenuation, lvl, buffs, curses) {
    tagValue = RivenParser.floatToRivenInt(tagValue);
    const fingerprint = { lvl, buffs: [], curses: [] };
    while (buffs-- > 0) {
        fingerprint.buffs.push({ Tag: "WeaponCritChanceMod", Value: 0 });
    }
    do {
        fingerprint.curses.push({ Tag: tag, Value: tagValue });
    } while (--curses > 0);
    return RivenParser.parseRiven(rivenType, fingerprint, omegaAttenuation).stats[fingerprint.buffs.length];
}

function isStatCompatibleWithWeapon(tag, weaponData, isBuff = true) {
    // Handle projectile speed compatibility
    if (tag === "WeaponProjectileSpeedMod" && 
        weaponData.compatibilityTags && 
        !weaponData.compatibilityTags.find(x => x === "PROJECTILE")) {
        return false;
    }
    
    // Handle damage type compatibility
    const upgradeTagToDamageType = {
        "WeaponImpactDamageMod": "DT_IMPACT",
        "WeaponArmorPiercingDamageMod": "DT_PUNCTURE",
        "WeaponSlashDamageMod": "DT_SLASH",
        "WeaponElectricityDamageMod": "DT_ELECTRICITY",
        "WeaponFireDamageMod": "DT_FIRE",
        "WeaponFreezeDamageMod": "DT_FREEZE",
        "WeaponToxinDamageMod": "DT_POISON",
    };
    
    if (tag in upgradeTagToDamageType) {
        const damageType = upgradeTagToDamageType[tag];
        if (!weaponCanRollDamageType(weaponData, damageType)) {
            const isPhysical = (damageType === "DT_IMPACT" || damageType === "DT_PUNCTURE" || damageType === "DT_SLASH");
            if (isPhysical || !isBuff) {
                return false;
            }
        }
    }
    
    return true;
}

function weaponCanRollDamageType(weaponData, damageType) {
    if (!weaponData.behaviors) {
        return true;
    }
    const behavior = weaponData.behaviors[0];
    const damageTable = behavior.projectile?.attack ? behavior.projectile.attack : behavior.impact;
    if (damageType in damageTable) {
        const totalDamage = Object.values(damageTable).reduce((a, b) => a + b, 0);
        return (damageTable[damageType] / totalDamage) > 0.2;
    }
    return false;
}

function shouldReverseSymbol(tag) {
    // Based on how rivencalc.php handles these
    return ["WeaponDamageAmountMod", "WeaponCritChanceMod", "WeaponCritDamageMod"].includes(tag);
}

function formatStatName(tag) {
    // Format the stat name for better readability
    const nameMap = {
        "WeaponArmorPiercingDamageMod": "Puncture Damage",
        "WeaponCritChanceMod": "Critical Chance",
        "WeaponCritDamageMod": "Critical Damage",
        "WeaponElectricityDamageMod": "Electricity Damage",
        "WeaponFireDamageMod": "Heat Damage",
        "WeaponFireRateMod": "Fire Rate",
        "WeaponFreezeDamageMod": "Cold Damage",
        "WeaponImpactDamageMod": "Impact Damage",
        "WeaponProcTimeMod": "Status Duration",
        "WeaponSlashDamageMod": "Slash Damage",
        "WeaponStunChanceMod": "Status Chance",
        "WeaponToxinDamageMod": "Toxin Damage",
        "WeaponAmmoMaxMod": "Ammo Maximum",
        "WeaponClipMaxMod": "Magazine Capacity",
        "WeaponDamageAmountMod": "Damage",
        "WeaponFireIterationsMod": "Multishot",
        "WeaponProjectileSpeedMod": "Projectile Speed",
        "WeaponPunctureDepthMod": "Punch Through",
        "WeaponRecoilReductionMod": "Recoil",
        "WeaponReloadSpeedMod": "Reload Speed",
        "WeaponZoomFovMod": "Zoom",
        "WeaponFactionDamageCorpus": "Damage to Corpus",
        "WeaponFactionDamageGrineer": "Damage to Grineer",
        "WeaponFactionDamageInfested": "Damage to Infested",
        "WeaponMeleeDamageMod": "Melee Damage",
        "WeaponMeleeFactionDamageCorpus": "Melee Damage to Corpus",
        "WeaponMeleeFactionDamageGrineer": "Melee Damage to Grineer",
        "WeaponMeleeFactionDamageInfested": "Melee Damage to Infested",
        "ComboDurationMod": "Combo Duration",
        "SlideAttackCritChanceMod": "Slide Crit Chance",
        "WeaponMeleeRangeIncMod": "Range",
        "WeaponMeleeFinisherDamageMod": "Finisher Damage",
        "WeaponMeleeComboEfficiencyMod": "Combo Efficiency",
        "WeaponMeleeComboInitialBonusMod": "Initial Combo",
        "WeaponMeleeComboPointsOnHitMod": "Melee Combo Count Chance",
        "WeaponMeleeComboBonusOnHitMod": "Heavy Attack Efficiency"
    };
    
    return nameMap[tag] || tag;
}

// You'll need to have this global dictionary for weapon name translations
// Simplified version for now
const dict = {}; 