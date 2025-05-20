const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Displays lyrics for the currently playing song.')
        .addStringOption(option =>
            option.setName('search')
                .setDescription('Search for a specific song (optional)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('synced')
                .setDescription('Whether to use synced lyrics (timestamps)')
                .setRequired(false)),
    async execute(interaction, player) {
        await interaction.deferReply();
        
        // Get options
        const searchQuery = interaction.options.getString('search');
        const useSyncedLyrics = interaction.options.getBoolean('synced');
        const queue = player.nodes.get(interaction.guildId);
        
        // Determine search query
        let query;
        if (!searchQuery) {
            // Use currently playing track if no search query provided
            if (!queue || !queue.isPlaying()) {
                return await interaction.editReply({ content: '❌ | No music is currently playing! Please provide a search query.', ephemeral: true });
            }
            
            const track = queue.currentTrack;
            if (!track) {
                return await interaction.editReply({ content: '❌ | No music is currently playing! Please provide a search query.', ephemeral: true });
            }
            
            query = {
                q: `${track.title} ${track.author}`,
                artistName: track.author
            };
        } else {
            // Use the provided search query
            query = {
                q: searchQuery
            };
        }
        
        try {
            // Search for lyrics using Discord Player's built-in lyrics functionality
            await interaction.editReply({ content: `🔍 Searching for lyrics of: **${query.q}**` });
            
            const results = await player.lyrics.search(query);
            
            if (!results || results.length === 0) {
                return await interaction.editReply({ content: `❌ | No lyrics found for: **${query.q}**` });
            }
            
            const lyrics = results[0];
            
            // If synced lyrics are requested and available
            if (useSyncedLyrics && lyrics.syncedLyrics && queue) {
                const songTitle = lyrics.title || 'this song';
                const artistName = lyrics.artist?.name || 'Unknown Artist';
                
                const initialEmbed = new EmbedBuilder()
                    .setColor('Blue')
                    .setTitle(`Synced Lyrics: ${songTitle}`)
                    .setAuthor({
                        name: artistName,
                        iconURL: lyrics.artist?.image
                    })
                    .setDescription('🎵 | Waiting for lyrics...')
                    .setFooter({ text: 'Lyrics will appear as the song plays' });
                
                if (lyrics.thumbnail) {
                    initialEmbed.setThumbnail(lyrics.thumbnail);
                }
                
                await interaction.editReply({ 
                    content: null,
                    embeds: [initialEmbed]
                });
                
                try {
                    // Send an initial message for lyrics that we'll update
                    const lyricsMessage = await interaction.channel.send({
                        content: '🎵 | Lyrics will appear here as the song plays...'
                    });
                    
                    // Load synced lyrics to the queue
                    const syncedLyrics = queue.syncedLyrics(lyrics);
                    
                    // Keep track of recently displayed lyrics to avoid spam
                    let lastTimestamp = '';
                    let lastLine = '';
                    
                    // Function to convert milliseconds to minutes:seconds.milliseconds format
                    const formatTimestamp = (ms) => {
                        const totalSeconds = Math.floor(ms / 1000);
                        const minutes = Math.floor(totalSeconds / 60);
                        const seconds = totalSeconds % 60;
                        const milliseconds = ms % 1000;
                        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
                    };
                    
                    // Listen to live updates
                    syncedLyrics.onChange(async (line, timestamp) => {
                        if (line) {
                            // Avoid duplicating lyrics if the timestamp is the same
                            if (timestamp === lastTimestamp && line === lastLine) {
                                return;
                            }
                            
                            lastTimestamp = timestamp;
                            lastLine = line;
                            
                            // Format the timestamp
                            const formattedTime = formatTimestamp(parseInt(timestamp));
                            
                            try {
                                // Edit the same message with new lyrics
                                await lyricsMessage.edit({
                                    content: `🎵 | [${formattedTime}]: ${line}`
                                });
                            } catch (editError) {
                                console.error('Error editing lyrics message:', editError);
                                // If editing fails (e.g., message too old), send a new message
                                try {
                                    const newLyricsMessage = await interaction.channel.send({
                                        content: `🎵 | [${formattedTime}]: ${line}`
                                    });
                                    // Update our reference to the new message
                                    lyricsMessage = newLyricsMessage;
                                } catch (e) {
                                    console.error('Failed to send new lyrics message:', e);
                                }
                            }
                        }
                    });
                    
                    // Start watching the queue for live updates
                    const unsubscribe = syncedLyrics.subscribe();
                    
                    // Create a timeout to automatically unsubscribe after the song duration
                    // This is a fallback in case the events don't trigger
                    const track = queue.currentTrack;
                    if (track && track.duration) {
                        // Parse duration like "3:45" to milliseconds
                        const durationParts = track.duration.split(':').map(Number);
                        let durationMs = 0;
                        if (durationParts.length === 2) { // MM:SS
                            durationMs = (durationParts[0] * 60 + durationParts[1]) * 1000;
                        } else if (durationParts.length === 3) { // HH:MM:SS
                            durationMs = (durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]) * 1000;
                        }
                        
                        if (durationMs > 0) {
                            setTimeout(() => {
                                try {
                                    unsubscribe();
                                    // Add a completion message
                                    lyricsMessage.edit({
                                        content: `🎵 | Lyrics complete for: **${songTitle}** by **${artistName}**`
                                    }).catch(() => {}); // Ignore errors
                                } catch (e) {
                                    // Ignore errors if already unsubscribed
                                }
                            }, durationMs + 5000); // Add 5 seconds buffer
                        }
                    }
                    
                    // Unsubscribe when the track changes
                    const handleUnsubscribe = () => {
                        try {
                            unsubscribe();
                            // Update the lyrics message to show it's finished
                            lyricsMessage.edit({
                                content: `🎵 | Lyrics ended for: **${songTitle}** by **${artistName}**`
                            }).catch(() => {}); // Ignore errors if edit fails
                        } catch (e) {
                            // Ignore errors if already unsubscribed
                        }
                    };
                    
                    // Use player events instead of queue events for better compatibility
                    // First check if events exists to avoid errors
                    try {
                        // Check if we can access player events (safer option)
                        player.events.on('playerFinish', (queue) => {
                            if (queue.guild.id === interaction.guildId) {
                                handleUnsubscribe();
                            }
                        });
                        
                        player.events.on('playerSkip', (queue) => {
                            if (queue.guild.id === interaction.guildId) {
                                handleUnsubscribe();
                            }
                        });
                        
                        player.events.on('emptyQueue', (queue) => {
                            if (queue.guild.id === interaction.guildId) {
                                handleUnsubscribe();
                            }
                        });
                        
                        player.events.on('disconnect', (queue) => {
                            if (queue.guild.id === interaction.guildId) {
                                handleUnsubscribe();
                            }
                        });
                    } catch (eventError) {
                        console.error('Error setting up player events:', eventError);
                        // If we can't set up events, rely on the timeout fallback
                    }
                    
                } catch (syncError) {
                    console.error('Error with synced lyrics:', syncError);
                    return await interaction.editReply({ 
                        content: `❌ | Error with synced lyrics: ${syncError.message}. Falling back to plain lyrics.`
                    });
                }
                
                return;
            }
            
            // Handle plain lyrics
            if (!lyrics.plainLyrics) {
                return await interaction.editReply({ content: `❌ | No lyrics content found for: **${query.q}**` });
            }
            
            // Trim lyrics to recommended size (1997 characters as per docs)
            const trimmedLyrics = lyrics.plainLyrics.substring(0, 1997);
            const isTrimmed = trimmedLyrics.length < lyrics.plainLyrics.length;
            
            // Create embed with lyrics information (following the exact pattern from docs)
            const embed = new EmbedBuilder()
                .setColor('Yellow')
                .setDescription(isTrimmed ? `${trimmedLyrics}...` : trimmedLyrics);
            
            // Add title if available
            if (lyrics.title) {
                embed.setTitle(lyrics.title);
            } else {
                embed.setTitle('Unknown Title');
            }
            
            // Add URL if available
            if (lyrics.url) {
                embed.setURL(lyrics.url);
            }
            
            // Add thumbnail if available
            if (lyrics.thumbnail) {
                embed.setThumbnail(lyrics.thumbnail);
            }
            
            // Add artist information if available
            if (lyrics.artist && lyrics.artist.name) {
                const authorData = {
                    name: lyrics.artist.name
                };
                
                if (lyrics.artist.image) {
                    authorData.iconURL = lyrics.artist.image;
                }
                
                if (lyrics.artist.url) {
                    authorData.url = lyrics.artist.url;
                }
                
                embed.setAuthor(authorData);
            }
            
            embed.setFooter({ text: 'Lyrics provided by LRCLib' });
            
            return await interaction.editReply({ content: null, embeds: [embed] });
            
        } catch (error) {
            console.error('Error fetching lyrics:', error);
            return await interaction.editReply({ content: `❌ | An error occurred while fetching lyrics: ${error.message}` });
        }
    },
}; 