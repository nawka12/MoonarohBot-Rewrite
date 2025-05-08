const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pauses the current song.'),
    async execute(interaction, player) {
        await interaction.deferReply();
        const queue = player.nodes.get(interaction.guildId);

        if (!queue || !queue.isPlaying()) {
            return await interaction.editReply({ content: '❌ | No music is being played!', ephemeral: true });
        }

        if (!interaction.member.voice.channel) {
            return await interaction.editReply({ content: '❌ | You need to be in a voice channel to use this command!', ephemeral: true });
        }
        
        if (queue.node.isPaused()) {
            return await interaction.editReply({ content: '❌ | The music is already paused!', ephemeral: true });
        }

        const success = queue.node.pause();

        const embed = new EmbedBuilder()
            .setColor(success ? 0xFFFF00 : 0xFF0000) // Yellow for paused, Red for error
            .setTitle(success ? '⏸️ Playback Paused' : '❌ Pause Failed')
            .setDescription(success ? 'The music has been paused.' : 'Could not pause the music.')
            .setTimestamp();
        
        if (success && queue.currentTrack) {
            embed.setThumbnail(queue.currentTrack.thumbnail);
        }

        return await interaction.editReply({ embeds: [embed] });
    },
}; 