const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Seeks to a specific timestamp in the current song.')
        .addIntegerOption(option =>
            option.setName('seconds')
                .setDescription('The timestamp in seconds to seek to.')
                .setRequired(true)
                .setMinValue(0)
        ),
    async execute(interaction, player) {
        await interaction.deferReply();
        const queue = player.nodes.get(interaction.guildId);

        if (!queue || !queue.isPlaying()) {
            return await interaction.editReply({ content: '❌ | No music is being played!', ephemeral: true });
        }

        if (!interaction.member.voice.channel) {
            return await interaction.editReply({ content: '❌ | You need to be in a voice channel to use this command!', ephemeral: true });
        }

        const secondsToSeek = interaction.options.getInteger('seconds', true);
        const currentTrack = queue.currentTrack;

        if (!currentTrack) {
             return await interaction.editReply({ content: '❌ | No track is currently loaded!', ephemeral: true });
        }
        
        // Convert track duration from HH:MM:SS or MM:SS to seconds if needed, or use durationMS
        // discord-player v6 track.durationMS is reliable
        const trackDurationMs = currentTrack.durationMS;
        if (secondsToSeek * 1000 > trackDurationMs) {
            return await interaction.editReply({ content: `❌ | Cannot seek beyond the song's duration (${currentTrack.duration}). Please provide a time in seconds within the track.`, ephemeral: true });
        }

        try {
            await queue.node.seek(secondsToSeek * 1000); // seek expects milliseconds
            
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('⏩ Seek Successful')
                .setDescription(`Seeked to **${new Date(secondsToSeek * 1000).toISOString().slice(11, 19)}** in **${currentTrack.title}**.`)
                .setThumbnail(currentTrack.thumbnail)
                .setTimestamp();

            return await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[SeekCommand Error]:', error);
            return await interaction.editReply({ content: '❌ | Could not seek to that position. The track might not be seekable or an error occurred.', ephemeral: true });
        }
    },
}; 