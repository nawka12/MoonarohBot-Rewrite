const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffles the songs in the queue.'),
    async execute(interaction, player) {
        await interaction.deferReply();
        const queue = player.nodes.get(interaction.guildId);

        if (!queue || !queue.isPlaying()) {
            return await interaction.editReply({ content: '❌ | No music is being played!', ephemeral: true });
        }

        if (!interaction.member.voice.channel) {
            return await interaction.editReply({ content: '❌ | You need to be in a voice channel to use this command!', ephemeral: true });
        }

        // Check if there are at least 2 songs in queue to shuffle
        if (queue.tracks.size < 2) {
            return await interaction.editReply({ content: '❌ | Need at least 2 songs in the queue to shuffle!', ephemeral: true });
        }

        try {
            // Store the original order of tracks
            const originalOrder = Array.from(queue.tracks.data).map(track => track.url);
            
            // Custom forced shuffle that ensures different order
            let maxAttempts = 3;
            let currentAttempt = 0;
            let differentEnough = false;
            
            while (!differentEnough && currentAttempt < maxAttempts) {
                // Try both shuffle methods
                try {
                    queue.tracks.shuffle();
                    console.log(`Shuffle attempt ${currentAttempt + 1} using tracks.shuffle()`);
                } catch (err) {
                    try {
                        queue.node.shuffle();
                        console.log(`Shuffle attempt ${currentAttempt + 1} using node.shuffle()`);
                    } catch (err2) {
                        console.error('Both shuffle methods failed:', err2);
                        throw new Error('Failed to shuffle queue');
                    }
                }
                
                // Check how different the new order is
                const newOrder = Array.from(queue.tracks.data).map(track => track.url);
                
                // Calculate how many tracks changed position
                let changedPositions = 0;
                for (let i = 0; i < originalOrder.length; i++) {
                    if (i >= newOrder.length || originalOrder[i] !== newOrder[i]) {
                        changedPositions++;
                    }
                }
                
                // Calculate percentage of tracks that changed position
                const changePercentage = (changedPositions / originalOrder.length) * 100;
                console.log(`Shuffle result: ${changePercentage.toFixed(1)}% of tracks changed positions`);
                
                // Consider it different enough if at least 70% of tracks changed position
                differentEnough = changePercentage >= 70;
                
                if (!differentEnough) {
                    console.log('Shuffle result too similar to original order, trying again...');
                    currentAttempt++;
                }
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🔀 Queue Shuffled')
                .setDescription('The queue has been thoroughly shuffled to a new order.')
                .setTimestamp();
            
            if (queue.currentTrack) {
                embed.setThumbnail(queue.currentTrack.thumbnail);
            }

            return await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[ShuffleCommand Error]:', error);
            return await interaction.editReply({ content: `❌ | An error occurred while trying to shuffle the queue: ${error.message}`, ephemeral: true });
        }
    },
}; 