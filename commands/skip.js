const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips the current song.'),
    async execute(interaction, player) {
        await interaction.deferReply();
        const queue = player.nodes.get(interaction.guildId);

        if (!queue || !queue.isPlaying()) {
            return await interaction.editReply({ content: '❌ | No music is being played!', ephemeral: true });
        }

        if (!interaction.member.voice.channel) {
            return await interaction.editReply({ content: '❌ | You need to be in a voice channel to use this command!', ephemeral: true });
        }

        const currentTrack = queue.currentTrack;
        const success = queue.node.skip();

        const embed = new EmbedBuilder()
            .setColor(success ? 0x00FF00 : 0xFF0000)
            .setTitle(success ? '⏭️ Song Skipped' : '❌ Skip Failed')
            .setDescription(success ? `Skipped **${currentTrack?.title || 'the current song'}**.` : 'Could not skip the song.')
            .setTimestamp();
        
        if (currentTrack) {
             embed.setThumbnail(currentTrack.thumbnail);
        }

        return await interaction.editReply({ embeds: [embed] });
    },
}; 