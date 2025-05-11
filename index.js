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
        
        // Register YouTubei extractor with more flexible download options
        try {
            // Configure YoutubeiExtractor with more format options
            await player.extractors.register(YoutubeiExtractor, {
                // Try multiple formats in order (fallback sequence)
                downloadOptions: {
                    quality: 'highestaudio',
                    filter: 'audioonly',
                    highWaterMark: 1 << 25,
                    dlChunkSize: 0,
                    // Expanded format fallback options for challenging videos
                    formats: [
                        { quality: 'highest', filter: 'audioonly' },
                        { quality: 'highestaudio' },
                        { quality: 'high', filter: 'audioonly' },
                        { quality: 'best', filter: 'audioonly' },
                        // Add more format combinations
                        { quality: 'highest', type: 'audio' },
                        { quality: 'highest', format: 'mp4', type: 'audio' },
                        { quality: 'highest', format: 'webm', type: 'audio' },
                        { filter: 'audioonly', format: 'mp4' },
                        { filter: 'audioonly', format: 'webm' },
                        // Last resort - include video formats too
                        { quality: 'highest' },
                        { quality: 'high' },
                        { quality: 'medium' },
                        { quality: 'lowest' },
                        // Try all common audio formats
                        { format: 'mp4', type: 'audio' },
                        { format: 'webm', type: 'audio' },
                        { format: 'mp3' },
                        { format: 'ogg' },
                        // Absolute last resort - any format
                        { quality: 'any' },
                        { type: 'audio' },
                        {}  // Empty object = any format available
                    ]
                }
            });
            console.log('YouTubei extractor registered with extended format options');
            
            // Since setPreference is not available, we'll handle priority differently
            // Make this the default extractor by registering it first
            console.log('Using YouTubei as primary extractor');
        } catch (error) {
            console.error(`Failed to register YouTubei extractor: ${error.message}`);
        }
        
        // Since setFallback is not available, we'll handle fallbacks in our error handlers
        console.log('Custom fallback mechanism will be used instead');
        
        // Log total registered extractors
        console.log(`Total registered extractors: ${player.extractors.size}`);
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

// Store timeout IDs for each guild to manage disconnection timers
const disconnectTimers = new Map();

// Track fallback operations in progress (made global for sharing across modules)
global.fallbacksInProgress = new Map();
const fallbacksInProgress = global.fallbacksInProgress;

// Helper to set fallback in progress with an automatic timeout
function setFallbackInProgress(guildId) {
    console.log(`[DEBUG] Setting fallback in progress for guild ${guildId}`);
    fallbacksInProgress.set(guildId, true);
    
    // Auto-clear after 2 minutes to prevent getting stuck
    setTimeout(() => {
        if (fallbacksInProgress.has(guildId)) {
            console.log(`[DEBUG] Auto-clearing fallback status for guild ${guildId} after timeout`);
            fallbacksInProgress.delete(guildId);
        }
    }, 120000); // 2 minutes timeout
}

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
        
        // Clear the disconnect timer if it exists
        if (disconnectTimers.has(queue.guild.id)) {
            clearTimeout(disconnectTimers.get(queue.guild.id));
            disconnectTimers.delete(queue.guild.id);
        }
    }
});

player.events.on('audioTracksAdd', (queue, tracks) => {
    if (queue.metadata?.channel) {
        queue.metadata.channel.send(`🎶 | **${tracks.length}** tracks queued!`).catch(console.error);
        
        // Clear the disconnect timer if it exists
        if (disconnectTimers.has(queue.guild.id)) {
            clearTimeout(disconnectTimers.get(queue.guild.id));
            disconnectTimers.delete(queue.guild.id);
        }
    }
});

player.events.on('disconnect', (queue) => {
    if (queue.metadata?.channel) {
        queue.metadata.channel.send('👋 | Looks like I was disconnected from the voice channel. Clearing the queue!').catch(console.error);
    }
});

player.events.on('emptyChannel', (queue) => {
    if (queue.metadata?.channel) {
        queue.metadata.channel.send('👋 | Voice channel is empty! Disconnecting...').catch(console.error);
        // Ensure we delete the queue to disconnect
        queue.delete();
    }
});

player.events.on('emptyQueue', (queue) => {
    // Add detailed logging to debug the race condition
    console.log(`[DEBUG] emptyQueue event fired for guild ${queue.guild.id}`);
    console.log(`[DEBUG] Current fallbacks in progress: ${JSON.stringify(Array.from(fallbacksInProgress.keys()))}`);
    console.log(`[DEBUG] Is fallback in progress for this guild: ${fallbacksInProgress.has(queue.guild.id)}`);
    
    // Check if we should handle this emptyQueue event
    // 1. Check if a fallback is in progress
    // 2. Check if any errors were recently reported
    // 3. Check if queue was manually deleted (connection gone)
    if (fallbacksInProgress.has(queue.guild.id)) {
        console.log(`Queue appears empty but fallback is in progress for guild ${queue.guild.id} - skipping disconnect timer`);
        return;
    }
    
    // Also check if connection is still valid - don't start a disconnect timer if already disconnected
    if (!queue.connection || !queue.connection.channel) {
        console.log(`Queue appears empty but connection is already gone - skipping disconnect timer`);
        return;
    }

    if (queue.metadata?.channel) {
        queue.metadata.channel.send('✅ | Queue finished! Will disconnect in 1 minute if no songs are added.').catch(console.error);
        
        // Clear any existing timer for this guild
        if (disconnectTimers.has(queue.guild.id)) {
            clearTimeout(disconnectTimers.get(queue.guild.id));
        }
        
        // Set a new timer to disconnect after 1 minute
        const timerId = setTimeout(() => {
            // Check if the queue still exists in the player
            const currentQueue = player.nodes.get(queue.guild.id);
            if (!currentQueue) {
                // Queue already deleted, just clean up the timer
                disconnectTimers.delete(queue.guild.id);
                return;
            }
            
            // Check if the queue is still empty before disconnecting
            if (queue.tracks.size === 0 && !queue.currentTrack) {
                queue.metadata.channel.send('👋 | No songs added after 1 minute. Disconnecting...').catch(console.error);
                queue.delete();
                disconnectTimers.delete(queue.guild.id);
            }
        }, 60000); // 1 minute
        
        disconnectTimers.set(queue.guild.id, timerId);
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
        
        // Mark fallback as in progress
        setFallbackInProgress(queue.guild.id);
        
        // First notify about the error and inform about fallback
        await queue.metadata.channel.send(`❌ | ${errorMessage}. **Starting fallback system to find an alternative track...**`);
        
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
        const songTitle = track.title;
        // Use the original title instead of heavily simplifying it
        const searchQuery = songTitle;
        
        console.log(`Fallback searching with original title: "${searchQuery}"`);
        
        // Search by the track title (using YouTubei explicitly)
        const searchResults = await player.search(searchQuery, {
            requestedBy: track.requestedBy || queue.metadata.requestedBy,
            searchEngine: 'youtube' // Force YouTube search
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
                        // First check if bot is already in a voice channel
                        const guild = queue.guild;
                        const botMember = guild.members.cache.get(client.user.id);
                        let voiceChannel = botMember?.voice?.channel;
                        
                        // If bot is not in a voice channel, try to use the requester's channel
                        if (!voiceChannel && queue.metadata?.member?.voice?.channel) {
                            voiceChannel = queue.metadata.member.voice.channel;
                        }
                        
                        // If still no voice channel, try to fetch the member to get updated voice state
                        if (!voiceChannel && queue.metadata?.member?.id) {
                            try {
                                const updatedMember = await guild.members.fetch(queue.metadata.member.id);
                                if (updatedMember?.voice?.channel) {
                                    voiceChannel = updatedMember.voice.channel;
                                }
                            } catch (fetchError) {
                                console.error('Error fetching updated member:', fetchError);
                            }
                        }
                        
                        // If we found a valid voice channel, connect to it
                        if (voiceChannel) {
                            await queue.connect(voiceChannel);
                            console.log(`Reconnected to voice channel: ${voiceChannel.name}`);
                        } else {
                            throw new Error('Cannot reconnect to voice channel - no valid voice channel found');
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
                    await queue.metadata.channel.send(`✅ | **Fallback succeeded!** Now playing alternative track: **${newTrack.title}**`);
                    return true;
                } catch (fallbackError) {
                    console.error(`Fallback attempt ${attempts+1} failed:`, fallbackError);
                    attempts++;
                }
            }
            
            // If all fallback attempts failed or no results found
            console.log(`All ${attempts} fallback attempts failed`);
            await queue.metadata.channel.send(`❌ | All fallback attempts failed after trying ${attempts} alternatives.`);
            
            fallbacksInProgress.delete(queue.guild.id);
            return false;
        } else {
            // No search results
            console.log(`No alternative tracks found for "${searchQuery}"`);
            await queue.metadata.channel.send(`❌ | Could not find any alternatives for "${track.title}"`);
        }
        
        fallbacksInProgress.delete(queue.guild.id);
        return false;
    } catch (fallbackError) {
        console.error(`[Fallback System Error]`, fallbackError);
        if (queue.metadata?.channel) {
            await queue.metadata.channel.send(`❌ | Fallback system error: ${fallbackError.message}`).catch(console.error);
        }
        fallbacksInProgress.delete(queue.guild.id);
        return false;
    }
}

// Update the playerError event handler
player.events.on('playerError', async (queue, error) => {
    console.error(`[Player Node Error] Error in guild ${queue?.guild?.id || 'unknown'}: ${error.message}`);
    
    // Mark fallback as in progress immediately
    if (queue?.guild?.id) {
        setFallbackInProgress(queue.guild.id);
    }
    
    // Special handling for "No matching formats found" errors
    if (error.message.includes('No matching formats found')) {
        console.log('No matching formats error detected - trying direct search fallback');
        
        // Get the failed track
        const failedTrack = queue.currentTrack;
        if (!failedTrack) {
            if (queue.metadata?.channel) {
                queue.metadata.channel.send(`❌ | Format error with no current track info.`).catch(console.error);
            }
            return;
        }
        
        try {
            if (queue.metadata?.channel) {
                queue.metadata.channel.send(`⚠️ | This video format couldn't be played. Searching for the song by title...`).catch(console.error);
            }
            
            // Use the original title for search
            const searchQuery = failedTrack.title;
            console.log(`Format error - searching by title: "${searchQuery}"`);
            
            // Search directly by title
            const searchResults = await player.search(searchQuery, {
                requestedBy: failedTrack.requestedBy,
                searchEngine: 'youtube'
            });
            
            if (searchResults && searchResults.tracks.length > 0) {
                // Skip current track that failed
                queue.node.stop();
                
                // Add first search result to queue
                const newTrack = searchResults.tracks[0];
                console.log(`Format error recovery: Found "${newTrack.title}"`);
                
                // Skip if it's the same URL that just failed
                if (newTrack.url === failedTrack.url) {
                    console.log('Format error recovery: Found same track URL - trying next result');
                    
                    // Try the second result if available
                    if (searchResults.tracks.length > 1) {
                        const secondTrack = searchResults.tracks[1];
                        console.log(`Format error recovery: Trying second result "${secondTrack.title}"`);
                        queue.addTrack(secondTrack);
                    } else {
                        if (queue.metadata?.channel) {
                            queue.metadata.channel.send(`❌ | Could not find an alternative version.`).catch(console.error);
                        }
                        return;
                    }
                } else {
                    queue.addTrack(newTrack);
                }
                
                // Start playback if not already playing
                if (!queue.isPlaying()) {
                    await queue.node.play();
                    console.log('Format error recovery: Started playback of new track');
                }
                
                if (queue.metadata?.channel) {
                    queue.metadata.channel.send(`✅ | **Format recovery successful** - Now playing similar track: **${newTrack.title}**`).catch(console.error);
                }
                return;
            } else {
                console.log('Format error recovery: No search results found');
                if (queue.metadata?.channel) {
                    queue.metadata.channel.send(`❌ | Could not find an alternative version by searching.`).catch(console.error);
                }
            }
        } catch (formatRecoveryError) {
            console.error('Format error recovery failed:', formatRecoveryError);
        }
    } 
    
    // Special handling for other format errors
    else if (error.message.includes('format') || error.message.includes('quality')) {
        console.log('Format-related error detected, switching to direct YouTube search fallback');
        
        // Get the failed track
        const failedTrack = queue.currentTrack;
        if (!failedTrack) {
            if (queue.metadata?.channel) {
                queue.metadata.channel.send(`❌ | Format error with no current track info.`).catch(console.error);
            }
            return;
        }
        
        try {
            if (queue.metadata?.channel) {
                queue.metadata.channel.send(`⚠️ | Format error detected. Trying to find an alternative version...`).catch(console.error);
            }
            
            // Extract just the song name and artist, removing any additional info
            const songTitle = failedTrack.title;
            const searchQuery = songTitle;
                
            console.log(`Simplified search query: "${searchQuery}"`);
            
            // Search by the simplified title
            const searchResults = await player.search(searchQuery, {
                requestedBy: failedTrack.requestedBy,
                searchEngine: 'youtube'
            });
            
            if (searchResults && searchResults.tracks.length > 0) {
                // Skip current track that failed
                queue.node.stop();
                
                // Add first search result to queue
                const newTrack = searchResults.tracks[0];
                console.log(`Format error fallback: Adding "${newTrack.title}" to queue`);
                queue.addTrack(newTrack);
                
                // Start playback if not already playing
                if (!queue.isPlaying()) {
                    await queue.node.play();
                    console.log('Format error fallback: Started playback of new track');
                }
                
                if (queue.metadata?.channel) {
                    queue.metadata.channel.send(`✅ | **Format fallback successful** - Now playing alternative track: **${newTrack.title}**`).catch(console.error);
                }
                return;
            } else {
                console.log('Format error fallback: No search results found');
            }
        } catch (formatFallbackError) {
            console.error('Format error fallback failed:', formatFallbackError);
        }
    }
    
    // If we get here, either the special handling didn't apply or it failed
    // Get the failed track
    const failedTrack = queue.currentTrack;
    if (!failedTrack) {
        if (queue.metadata?.channel) {
            queue.metadata.channel.send(`❌ | An error occurred with the player node: ${error.message}`).catch(console.error);
        }
        return;
    }
    
    console.log('PLAYER ERROR EVENT - Triggering fallback system');
    if (queue.metadata?.channel) {
        await queue.metadata.channel.send(`⚠️ | Playback error detected. Looking for an alternative version...`);
    }
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
        await queue.metadata.channel.send(`⚠️ | Track ended unexpectedly. Searching for an alternative...`);
        await handleTrackFallback(queue, track, 'Track ended with an error');
    }
});

// Enhanced error event handler
player.events.on('error', async (queue, error) => {
    console.error(`[Player Error] Error in guild ${queue?.guild?.id || 'unknown'}: ${error.message}`);
    
    // Mark fallback as in progress immediately
    if (queue?.guild?.id) {
        setFallbackInProgress(queue.guild.id);
    }
    
    // Only attempt fallback if we have the current track
    const currentTrack = queue.currentTrack;
    if (!currentTrack) {
        if (queue.metadata?.channel) {
            queue.metadata.channel.send(`❌ | An error occurred: ${error.message}`).catch(console.error);
        }
        return;
    }
    
    console.log('ERROR EVENT - Triggering fallback system');
    if (queue.metadata?.channel) {
        await queue.metadata.channel.send(`⚠️ | Error playing track. Searching for an alternative version...`);
    }
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

// Replace the previous voiceStateUpdate handler with this improved version
client.on("voiceStateUpdate", (oldState, newState) => {
    // Check if a user has left a voice channel
    if (oldState.channelId && !newState.channelId) {
        const guild = oldState.guild;
        const channel = oldState.channel;
        
        // If the bot is in a voice channel in this guild
        if (guild.members.me && guild.members.me.voice.channel) {
            const botVoiceChannel = guild.members.me.voice.channel;
            
            // Get current queue for this guild
            const queue = player.nodes.get(guild.id);
            
            // Check if the bot is the only one left in the voice channel
            if (botVoiceChannel.members.size === 1 && queue) {
                // Get the text channel associated with the player
                const textChannel = queue.metadata?.channel;
                
                if (textChannel) {
                    textChannel.send("👋 | Everyone left the voice channel. Disconnecting...").catch(console.error);
                    
                    // Disconnect the bot and clear the queue
                    queue.delete();
                }
            }
        }
    }
});

// Login to Discord
client.login(token); 