const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resumes the current song if paused.'),
    async execute(interaction, player) {
        await interaction.deferReply();
        const queue = player.nodes.get(interaction.guildId);

        if (!queue || !queue.currentTrack) {
            return await interaction.editReply({ content: '❌ | No music is in the queue!', ephemeral: true });
        }

        // Simplified voice channel check - only verify the member is in a voice channel
        if (!interaction.member.voice.channel) {
            return await interaction.editReply({ content: '❌ | You need to be in a voice channel to use this command!', ephemeral: true });
        }

        if (!queue.node.isPaused()) {
            return await interaction.editReply({ content: '❌ | The music is not paused!', ephemeral: true });
        }

        const success = queue.node.resume();

        const embed = new EmbedBuilder()
            .setColor(success ? 0x00FF00 : 0xFF0000) // Green for resumed, Red for error
            .setTitle(success ? '▶️ Playback Resumed' : '❌ Resume Failed')
            .setDescription(success ? 'The music has been resumed.' : 'Could not resume the music.')
            .setTimestamp();
        
        if (success && queue.currentTrack) {
            embed.setThumbnail(queue.currentTrack.thumbnail);
        }

        return await interaction.editReply({ embeds: [embed] });
    },
}; 