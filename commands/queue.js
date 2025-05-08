const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Displays the current song queue.')
        .addIntegerOption(option => 
            option.setName('page')
                .setDescription('Page number of the queue to display')
                .setRequired(false)
                .setMinValue(1)
        ),
    async execute(interaction, player) {
        await interaction.deferReply();
        const queue = player.nodes.get(interaction.guildId);

        if (!queue || (!queue.isPlaying() && queue.tracks.size === 0)) {
            return await interaction.editReply({ content: '❌ | No music is being played and the queue is empty!', ephemeral: true });
        }

        const page = interaction.options.getInteger('page') || 1;
        const tracksPerPage = 10;
        // Calculate total pages based on tracks in queue. If 0 tracks, but 1 playing, then 1 page.
        const totalPages = Math.max(1, Math.ceil(queue.tracks.size / tracksPerPage));


        if (page > totalPages) {
            return await interaction.editReply({ content: `❌ | Invalid page number. There are only ${totalPages} pages in the queue.`, ephemeral: true });
        }

        const queueStart = (page - 1) * tracksPerPage;
        const queueEnd = queueStart + tracksPerPage;
        const tracksToShow = queue.tracks.data.slice(queueStart, queueEnd);

        let descriptionLines = [];
        const currentTrack = queue.currentTrack;

        descriptionLines.push('**Currently Playing:**');
        if (currentTrack) {
            descriptionLines.push(`\`[${currentTrack.duration}]\` **${currentTrack.title}** - <@${currentTrack.requestedBy.id}>`);
        } else {
            descriptionLines.push('Nothing playing.');
        }
        descriptionLines.push(''); // Add a blank line

        if (tracksToShow.length > 0) {
            descriptionLines.push('**Up Next:**');
            tracksToShow.forEach((track, i) => {
                descriptionLines.push(`**${queueStart + i + 1}.** \`[${track.duration}]\` ${track.title} - <@${track.requestedBy.id}>`);
            });
        } else if (queue.tracks.size === 0 && currentTrack) {
            descriptionLines.push('Queue is empty after the current track.');
        } else if (queue.tracks.size === 0 && !currentTrack) {
            // This case is mostly handled by the initial check, but as a safeguard:
            descriptionLines.push('The queue is completely empty.');
        }


        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`🎶 Current Queue (Page ${page}/${totalPages})`)
            .setThumbnail(currentTrack?.thumbnail || interaction.client.user.displayAvatarURL())
            .setDescription(descriptionLines.join('\n'))
            .setFooter({ text: `Loop: ${queue.repeatMode === 0 ? 'Off' : queue.repeatMode === 1 ? 'Track' : queue.repeatMode === 2 ? 'Queue' : 'Autoplay'} | Vol: ${queue.node.volume}%` })
            .setTimestamp();

        let totalDurationMs = queue.tracks.data.reduce((acc, track) => acc + track.durationMS, 0);
        if (currentTrack) totalDurationMs += currentTrack.durationMS;
        
        if (totalDurationMs > 0) {
           const formatDuration = (ms) => {
                if (ms === 0) return '00:00:00';
                const seconds = Math.floor((ms / 1000) % 60);
                const minutes = Math.floor((ms / (1000 * 60)) % 60);
                const hours = Math.floor(ms / (1000 * 60 * 60)); // Total hours
                return [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':');
            };
            embed.addFields({ name: 'Total Queue Duration', value: formatDuration(totalDurationMs), inline: false });
        }

        return await interaction.editReply({ embeds: [embed] });
    },
};