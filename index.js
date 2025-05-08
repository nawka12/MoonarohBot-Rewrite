require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, REST, Routes, ActivityType } = require('discord.js');
const { Player } = require('discord-player');
const { SpotifyExtractor } = require('@discord-player/extractor');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const { AppleMusicExtractor } = require('@discord-player/extractor');
const fs = require('node:fs');
const path = require('node:path');

// Check if TOKEN exists (prefer TOKEN over DISCORD_BOT_TOKEN for compatibility)
const token = process.env.TOKEN || process.env.DISCORD_BOT_TOKEN;
console.log('Bot token exists:', !!token);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize commands collection
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load all command files
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Initialize REST API client
const rest = new REST({ version: '10' }).setToken(token);

// Initialize the Player
const player = new Player(client, {
    ytdlOptions: {
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
    },
    smoothVolume: true,
    useLegacyFFmpeg: false,
    disableHistory: false,
    skipFFprobe: false,
});

// Log player version
console.log(`Initializing discord-player ${require('discord-player/package.json').version}`);

// Register extractors
(async () => {
    try {
        console.log('Starting extractor registration...');
        
        // Only register YouTubei extractor - drop other platforms
        console.log('Registering ONLY YouTubei extractor - dropping support for other platforms...');
        
        // Register YouTubei extractor
        try {
            await player.extractors.register(YoutubeiExtractor);
            console.log('YouTubei extractor registered - THIS WILL BE USED FOR ALL STREAMING AND METADATA');
            
            // FORCE YouTubei as the ONLY streaming extractor
            player.extractors.setPreference('YouTubeiExtractor', true);
            console.log('FORCED YouTubei as the mandatory extractor for all operations');
        } catch (error) {
            console.error(`Failed to register YouTubei extractor: ${error.message}`);
        }
        
        // Disable fallback to ensure if YouTubei fails, it fails completely
        player.extractors.setFallback(false);
        console.log('Extractor fallback DISABLED - using ONLY YouTubei');
        
        // Log total registered extractors
        console.log(`Total registered extractors: ${player.extractors.size} (YouTube only)`);
    } catch (error) {
        console.error(`Error in extractor registration: ${error.message}`);
    }
})();

// Update the deployCommands function to match existing deploy-commands.js
async function deployCommands() {
    try {
        console.log('Starting to deploy commands...');
        const commands = [];
        const commandsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }

        const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_BOT_TOKEN);

        console.log(`Deploying ${commands.length} application commands...`);

        // Check if we should deploy globally or to a specific guild
        if (process.env.GUILD_ID) {
            // Deploy to specific guild (faster for testing)
            const data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands },
            );
            console.log(`Successfully deployed ${data.length} commands to guild ID ${process.env.GUILD_ID}!`);
        } else {
            // Deploy globally (takes up to an hour to propagate)
            const data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands },
            );
            console.log(`Successfully deployed ${data.length} commands globally!`);
        }
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
}

// Update playerStart event handler - remove Japanese character detection
player.events.on('playerStart', async (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Now Playing')
        .setDescription(`▶️ | Started playing: **${track.title}**${queue.connection?.channel ? ` in **${queue.connection.channel.name}**` : ''}!`)
        .setThumbnail(track.thumbnail);
    
    // Add requested by field only if requestedBy is available
    if (track.requestedBy) {
        embed.addFields({ name: 'Requested by', value: track.requestedBy.toString(), inline: true });
    }
    
    embed.setTimestamp();
    
    if (queue.metadata?.channel) {
        queue.metadata.channel.send({ embeds: [embed] }).catch(console.error);
    }
});

player.events.on('audioTrackAdd', (queue, track) => {
    if (queue.metadata?.channel) {
        queue.metadata.channel.send(`🎶 | Track **${track.title}** queued!`).catch(console.error);
    }
});

player.events.on('audioTracksAdd', (queue, tracks) => {
    if (queue.metadata?.channel) {
        queue.metadata.channel.send(`🎶 | **${tracks.length}** tracks queued!`).catch(console.error);
    }
});

player.events.on('disconnect', (queue) => {
    if (queue.metadata?.channel) {
        queue.metadata.channel.send('👋 | Looks like I was disconnected from the voice channel. Clearing the queue!').catch(console.error);
    }
});

player.events.on('emptyChannel', (queue) => {
    if (queue.metadata?.channel) {
        queue.metadata.channel.send('誰もいないのでボイスチャンネルから退出しました。').catch(console.error);
    }
});

player.events.on('emptyQueue', (queue) => {
    if (queue.metadata?.channel) {
        queue.metadata.channel.send('✅ | Queue finished!').catch(console.error);
    }
});

// Improve the fallback utility function's voice channel handling
async function handleTrackFallback(queue, track, errorMessage) {
    if (!queue?.metadata?.channel || !track) {
        console.log('Cannot perform fallback: missing queue metadata or track');
        return false;
    }
    
    try {
        console.log(`FALLBACK TRIGGERED for track: "${track.title}"`);
        
        // First notify about the error
        await queue.metadata.channel.send(`❌ | ${errorMessage}. Starting fallback system...`);
        
        // Force stop any current playback with improved error handling
        try {
            if (queue.connection) {
                console.log('Forcefully stopping current playback');
                
                // Reset connection state if needed
                if (queue.connection.state.status !== 'ready') {
                    console.log('Connection not in ready state, attempting to reset');
                    // Try to reconnect if possible
                    if (queue.connection.channel) {
                        try {
                            await queue.connection.rejoin();
                            console.log('Successfully rejoined voice channel');
                        } catch (rejoinError) {
                            console.error('Failed to rejoin voice channel:', rejoinError);
                        }
                    }
                }
                
                if (queue.isPlaying()) {
                    queue.node.stop();
                }
            }
        } catch (stopError) {
            console.error('Error stopping current track:', stopError);
        }
        
        // Get the track title to use for search
        const searchQuery = track.title;
        console.log(`Fallback searching with query: "${searchQuery}"`);
        
        // Search by the track title (using YouTubei explicitly)
        const searchResults = await player.search(searchQuery, {
            requestedBy: track.requestedBy || queue.metadata.requestedBy,
            searchEngine: 'youtube', // Force YouTube search
            extractor: "YouTubeiExtractor" // Force YouTubei extractor
        });
        
        console.log(`Fallback search returned ${searchResults?.tracks?.length || 0} results`);
        
        // If we found results, try to play them
        if (searchResults && searchResults.tracks.length > 0) {
            // Try up to 3 top results
            let played = false;
            let attempts = 0;
            const maxAttempts = Math.min(3, searchResults.tracks.length);
            
            // Log the tracks we'll try
            console.log(`Will try up to ${maxAttempts} alternative tracks:`);
            for (let i = 0; i < maxAttempts; i++) {
                console.log(`  ${i+1}: "${searchResults.tracks[i].title}"`);
            }
            
            while (!played && attempts < maxAttempts) {
                try {
                    const newTrack = searchResults.tracks[attempts];
                    // Skip if it's the same URL that just failed
                    if (newTrack.url === track.url) {
                        console.log(`Skipping attempt ${attempts+1} - same URL as failed track`);
                        attempts++;
                        continue;
                    }
                    
                    console.log(`Trying fallback attempt ${attempts+1}: "${newTrack.title}"`);
                    
                    // Let the user know which result we're trying
                    await queue.metadata.channel.send(`🔄 | Fallback attempt ${attempts+1}: Trying "${newTrack.title}"...`);
                    
                    // Ensure connection is valid
                    if (!queue.connection || !queue.connection.channel) {
                        console.log('Voice connection lost, attempting to reconnect');
                        // Try to reconnect to the voice channel
                        if (queue.metadata?.member?.voice?.channel) {
                            await queue.connect(queue.metadata.member.voice.channel);
                            console.log('Reconnected to voice channel');
                        } else {
                            throw new Error('Cannot reconnect to voice channel - user not in a voice channel');
                        }
                    }
                    
                    // Clear current queue and stop any playback
                    console.log('Clearing queue and stopping any current playback');
                    queue.tracks.clear();
                    try {
                        if (queue.isPlaying()) {
                            queue.node.stop();
                        }
                    } catch (e) {
                        console.error('Error stopping playback before fallback:', e);
                    }
                    
                    // Add the new track
                    console.log(`Adding fallback track to queue: "${newTrack.title}"`);
                    queue.addTrack(newTrack);
                    
                    // Try to play the new track with delay to ensure clean state
                    console.log('Starting playback of fallback track...');
                    await new Promise(resolve => setTimeout(resolve, 500)); // Short delay
                    await queue.node.play();
                    
                    // Wait to see if the track actually plays
                    console.log('Waiting to confirm playback started...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Check if we're actually playing
                    if (!queue.isPlaying()) {
                        console.log('Fallback track failed to play (silent fail)');
                        throw new Error('Track failed to play');
                    }
                    
                    // If we got here, it worked!
                    played = true;
                    console.log(`Fallback SUCCESS with "${newTrack.title}"`);
                    await queue.metadata.channel.send(`✅ | Fallback succeeded! Now playing: **${newTrack.title}**`);
                    return true;
                } catch (fallbackError) {
                    console.error(`Fallback attempt ${attempts+1} failed:`, fallbackError);
                    attempts++;
                }
            }
            
            // If all fallback attempts failed
            if (!played) {
                console.log(`All ${attempts} fallback attempts failed`);
                await queue.metadata.channel.send(`❌ | All fallback attempts failed after trying ${attempts} alternatives.`);
            }
        } else {
            // No search results
            console.log(`No alternative tracks found for "${searchQuery}"`);
            await queue.metadata.channel.send(`❌ | Could not find any alternatives for "${track.title}"`);
        }
        
        return false;
    } catch (fallbackError) {
        console.error(`[Fallback System Error]`, fallbackError);
        if (queue.metadata?.channel) {
            await queue.metadata.channel.send(`❌ | Fallback system error: ${fallbackError.message}`).catch(console.error);
        }
        return false;
    }
}

// Update the playerError event handler
player.events.on('playerError', async (queue, error) => {
    console.error(`[Player Node Error] Error in guild ${queue?.guild?.id || 'unknown'}: ${error.message}`);
    
    // Get the failed track
    const failedTrack = queue.currentTrack;
    if (!failedTrack) {
        if (queue.metadata?.channel) {
            queue.metadata.channel.send(`❌ | An error occurred with the player node: ${error.message}`).catch(console.error);
        }
        return;
    }
    
    console.log('PLAYER ERROR EVENT - Triggering fallback system');
    const success = await handleTrackFallback(queue, failedTrack, `Failed to play track: ${error.message}`);
    
    if (!success) {
        console.log('Fallback system failed to find a working alternative');
    }
});

// Also handle the trackEnd event to check if it ended due to error
player.events.on('trackEnd', async (queue, track, reason) => {
    console.log(`Track ended with reason: ${reason}`);
    
    // Only trigger fallback for tracks that end with an error
    if (reason === 'ERROR') {
        console.log('Track ended with ERROR - Triggering fallback');
        await handleTrackFallback(queue, track, 'Track ended with an error');
    }
});

// Enhanced error event handler
player.events.on('error', async (queue, error) => {
    console.error(`[Player Error] Error in guild ${queue?.guild?.id || 'unknown'}: ${error.message}`);
    
    // Only attempt fallback if we have the current track
    const currentTrack = queue.currentTrack;
    if (!currentTrack) {
        if (queue.metadata?.channel) {
            queue.metadata.channel.send(`❌ | An error occurred: ${error.message}`).catch(console.error);
        }
        return;
    }
    
    console.log('ERROR EVENT - Triggering fallback system');
    const success = await handleTrackFallback(queue, currentTrack, `Error playing track: ${error.message}`);
    
    if (!success) {
        console.log('Fallback system failed to find a working alternative');
    }
});

// Ready event - when the bot is fully initialized
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`discord-player version: ${require('discord-player/package.json').version}`);
    console.log(`Node.js version: ${process.version}`);
    
    // Set activity
    client.user.setActivity('music | /play', { type: ActivityType.Listening });
    
    // Only define the deployCommands function after client is ready and application.id is available
    const applicationId = client.application.id;
    console.log(`Application ID: ${applicationId}`);
    
    // Function to deploy commands for a specific guild
    async function deployCommands(guildId) {
        try {
            console.log(`Started refreshing application (/) commands for guild ${guildId}.`);

            // Prepare an array of command JSON data
            const commandData = [];
            for (const command of client.commands.values()) {
                commandData.push(command.data.toJSON());
            }

            // Deploy commands to the specified guild
            await rest.put(
                Routes.applicationGuildCommands(applicationId, guildId),
                { body: commandData },
            );

            console.log(`Successfully reloaded application (/) commands for guild ${guildId}.`);
        } catch (error) {
            console.error(`Error deploying commands to guild ${guildId}:`, error);
        }
    }
    
    // Deploy commands to all guilds the bot is in
    console.log(`Deploying commands to ${client.guilds.cache.size} guilds...`);
    for (const guild of client.guilds.cache.values()) {
        try {
            await deployCommands(guild.id);
        } catch (error) {
            console.error(`Failed to deploy commands to guild ${guild.id} (${guild.name}):`, error);
        }
    }
    
    // When the bot joins a new guild, deploy commands to that guild
    client.on('guildCreate', async (guild) => {
        console.log(`Joined new guild: ${guild.name} (${guild.id})`);
        try {
            await deployCommands(guild.id);
        } catch (error) {
            console.error(`Failed to deploy commands to new guild ${guild.id} (${guild.name}):`, error);
        }
    });
});

// Handle errors and warnings at the client level
client.on('error', error => console.error('Discord client error:', error));
client.on('warn', warning => console.warn('Discord client warning:', warning));

// Interaction event to handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction, player);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

// Login to Discord
client.login(token); 