const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QueryType } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from YouTube.')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The YouTube URL or search query')
                .setRequired(true)
        ),
    async execute(interaction, player) {
        await interaction.deferReply();

        if (!interaction.member.voice.channelId) {
            return await interaction.editReply({ content: '❌ | You are not in a voice channel!', ephemeral: true });
        }
        if (interaction.guild.members.me.voice.channelId && interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId) {
            return await interaction.editReply({ content: '❌ | You are not in my voice channel!', ephemeral: true });
        }

        let query = interaction.options.getString('query', true);
        const isYouTubeLink = query.includes('youtube.com') || query.includes('youtu.be');
        let originalYouTubeTitle = null;  // Store the original YouTube title for fallback

        // Create queue first (we'll need it for error handling)
        const queue = player.nodes.create(interaction.guild, {
            metadata: {
                channel: interaction.channel,
                client: interaction.guild.members.me,
                requestedBy: interaction.user
            },
            selfDeaf: true,
            volume: 80,
            leaveOnEmpty: true,
            leaveOnEmptyCooldown: 300000, // 5 minutes
            leaveOnEnd: true,
            leaveOnEndCooldown: 300000, // 5 minutes
            connectionTimeout: 20000 // 20 seconds
        });

        try {
            // Check for non-YouTube platform links first and reject them
            if (query.includes('spotify.com')) {
                return await interaction.editReply({ 
                    content: '❌ | Spotify links are not supported. This bot only supports YouTube links or search queries.',
                    ephemeral: true 
                });
            } else if (query.includes('apple.com/music') || query.includes('music.apple.com')) {
                return await interaction.editReply({ 
                    content: '❌ | Apple Music links are not supported. This bot only supports YouTube links or search queries.',
                    ephemeral: true 
                });
            } else if (query.includes('soundcloud.com')) {
                return await interaction.editReply({ 
                    content: '❌ | SoundCloud links are not supported. This bot only supports YouTube links or search queries.',
                    ephemeral: true 
                });
            } else if (query.includes('deezer.com')) {
                return await interaction.editReply({ 
                    content: '❌ | Deezer links are not supported. This bot only supports YouTube links or search queries.',
                    ephemeral: true 
                });
            } else if (query.includes('tidal.com')) {
                return await interaction.editReply({ 
                    content: '❌ | Tidal links are not supported. This bot only supports YouTube links or search queries.',
                    ephemeral: true 
                });
            } else if (/https?:\/\/(?!.*youtu\.?be)/.test(query)) {
                // This regex detects any URL that doesn't contain youtube or youtu.be
                return await interaction.editReply({ 
                    content: '❌ | This link is not supported. This bot only supports YouTube links or search queries.',
                    ephemeral: true 
                });
            }
            
            // For YouTube links or searches only
            if (isYouTubeLink) {
                console.log('Processing YouTube link...');
            } else {
                console.log('Processing YouTube search query...');
            }

            // Search for tracks using YouTubei extractor only
            let searchResult = await player.search(query, {
                requestedBy: interaction.user,
                searchEngine: QueryType.AUTO,
                extractor: "YouTubeiExtractor"
            });

            // Store original YouTube title for possible fallback
            if (isYouTubeLink && searchResult.tracks.length > 0) {
                originalYouTubeTitle = searchResult.tracks[0].title;
                console.log(`Stored original YouTube title for fallback: ${originalYouTubeTitle}`);
            }

            // If no results, try to handle YouTube link specially
            if ((!searchResult || !searchResult.tracks.length) && isYouTubeLink) {
                // Update the user
                await interaction.editReply({ content: 'YouTube link failed. Trying to extract video ID...' });
                
                // Could not get info from link, try to extract video ID and use it as a search query
                const videoId = extractYouTubeVideoId(query);
                if (videoId) {
                    query = `https://www.youtube.com/watch?v=${videoId}`;
                    searchResult = await player.search(query, {
                        requestedBy: interaction.user,
                        searchEngine: QueryType.AUTO,
                        extractor: "YouTubeiExtractor"
                    });
                }
            }

            // Still no results
            if (!searchResult || !searchResult.tracks.length) {
                return await interaction.editReply({ content: `❌ | No results found for \`${query}\`!`, ephemeral: true });
            }

            // Attempt to join voice channel
            try {
                if (!queue.connection) await queue.connect(interaction.member.voice.channel);
            } catch (err) {
                console.error(err);
                player.nodes.delete(interaction.guildId);
                return await interaction.editReply({ content: '❌ | Could not join your voice channel!', ephemeral: true });
            }

            // Try to play with fallback logic
            const maxAttempts = 3;
            let success = false;
            let attemptCount = 0;
            let lastError = null;
            let currentTrack = null;

            while (!success && attemptCount < maxAttempts && attemptCount < searchResult.tracks.length) {
                try {
                    currentTrack = searchResult.tracks[attemptCount];
                    
                    if (attemptCount > 0) {
                        console.log(`Play command attempt ${attemptCount+1}: Trying "${currentTrack.title}"...`);
                        await interaction.editReply({ content: `Attempt ${attemptCount+1}: Trying next search result: "${currentTrack.title}"...` });
                    } else {
                        console.log(`Play command first attempt: Trying "${currentTrack.title}"...`);
                    }
                    
                    // Add the tracks to the queue, but check for duplicates
                    if (searchResult.playlist && attemptCount === 0) {
                        // For playlists, add all tracks
                        queue.addTrack(searchResult.tracks);
                    } else {
                        // For single tracks - check if this track is the currently playing one
                        if (queue.currentTrack && queue.currentTrack.url === currentTrack.url) {
                            console.log(`Play command: Skipping duplicate track (already playing ${currentTrack.title})`);
                        } else {
                            queue.addTrack(currentTrack);
                        }
                    }

                    // Start playback only if not already playing
                    if (!queue.isPlaying()) {
                        try {
                            console.log(`Play command: Attempting to play now...`);
                            
                            // Start playing the first track in queue (which we just added)
                            const playPromise = queue.node.play();
                            
                            // Wait a short time to see if an error occurs during playback start
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            
                            // Check if we're still playing after the delay
                            if (!queue.isPlaying()) {
                                console.log(`Play command: Playback failed silently, throwing error`);
                                throw new Error("Playback failed to start properly");
                            }
                            
                            // Now we can safely consider this successful
                            await playPromise;
                            console.log(`Play command: Successfully started playback!`);
                        } catch (error) {
                            throw error; // Re-throw to be caught by outer catch block
                        }
                    } else {
                        // Already playing, just confirm success
                        console.log(`Play command: Track added to queue, continuing current playback`);
                        success = true;
                    }
                } catch (error) {
                    console.error(`Play command attempt ${attemptCount+1} failed:`, error);
                    lastError = error;
                    
                    // Clear the track that failed
                    if (!searchResult.playlist || attemptCount > 0) {
                        queue.tracks.clear();
                    }
                    
                    attemptCount++;
                    
                    // If we've tried all tracks and we're on a YouTube link, try searching by title
                    if (attemptCount >= Math.min(maxAttempts, searchResult.tracks.length) && 
                        isYouTubeLink && originalYouTubeTitle && !query.startsWith('ytsearch:')) {
                        console.log(`Play command: All ${attemptCount} attempts failed, trying to search by title: "${originalYouTubeTitle}"`);
                        await interaction.editReply({ content: 'YouTube link failed. Searching by video title...' });
                        
                        // Search by title using ONLY YouTubei
                        query = originalYouTubeTitle;
                        searchResult = await player.search(query, {
                            requestedBy: interaction.user,
                            searchEngine: QueryType.AUTO,
                            // Force use of YouTubei extractor only
                            extractor: "YouTubeiExtractor"
                        });
                        
                        console.log(`Play command: Title search returned ${searchResult?.tracks?.length || 0} results`);
                        
                        // Reset attempt counter to try the new search results
                        if (searchResult && searchResult.tracks.length > 0) {
                            attemptCount = 0; 
                        }
                    }
                }
            }

            // If all attempts failed
            if (!success) {
                console.log(`Play command: All fallback attempts failed after ${attemptCount} tries`);
                player.nodes.delete(interaction.guildId);
                return await interaction.editReply({ 
                    content: `❌ | Failed to play after ${attemptCount} attempts. Error: ${lastError?.message || 'Unknown error'}`,
                    ephemeral: true 
                });
            }

            // Success! Build the embed
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ dynamic: true}) });

            if (searchResult.playlist && attemptCount === 0) {
                embed.setTitle('🎶 YouTube Playlist Added to Queue')
                    .setDescription(`Added **${searchResult.tracks.length}** tracks from **${searchResult.playlist.title}** to the queue.`)
                    .setThumbnail(searchResult.tracks[0]?.thumbnail || interaction.client.user.displayAvatarURL());
            } else {
                const durationString = currentTrack.duration || 'Unknown';
                
                embed.setTitle('🎵 YouTube Track Added to Queue')
                    .setDescription(`Added **${currentTrack.title}** to the queue.`)
                    .setThumbnail(currentTrack.thumbnail);
                
                // Add fields ensuring all values are strings
                embed.addFields([
                    { name: 'Duration', value: String(durationString), inline: true },
                    { name: 'Source', value: 'YouTube', inline: true }
                ]);
                
                // If we had to fall back, mention it
                if (attemptCount > 0) {
                    embed.addFields([
                        { name: 'Note', value: `Fallback was used (attempt ${attemptCount + 1} of ${maxAttempts})`, inline: false }
                    ]);
                }
            }
            
            return await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[PlayCommand Error]:', error);
            player.nodes.delete(interaction.guildId); // Clean up the queue if an error occurs
            
            // Provide YouTube-specific error messages
            if (error.message?.includes('age restricted')) {
                return await interaction.editReply({ 
                    content: '❌ | This video is age-restricted and cannot be played.',
                    ephemeral: true 
                });
            } else if (error.message?.includes('copyright') || error.message?.includes('blocked')) {
                return await interaction.editReply({ 
                    content: '❌ | This content is unavailable due to copyright restrictions or regional blocks.',
                    ephemeral: true 
                });
            } else {
                return await interaction.editReply({ 
                    content: `❌ | Error playing YouTube content: ${error.message}`, 
                    ephemeral: true 
                });
            }
        }
    },
};

// Helper function to extract YouTube video ID
function extractYouTubeVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
} 