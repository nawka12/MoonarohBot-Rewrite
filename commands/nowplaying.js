const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Displays information about the currently playing song.'),
    async execute(interaction, player) {
        await interaction.deferReply();
        const queue = player.nodes.get(interaction.guildId);

        if (!queue || !queue.isPlaying()) {
            return await interaction.editReply({ content: '❌ | No music is currently playing!', ephemeral: true });
        }

        const track = queue.currentTrack;
        if (!track) {
            return await interaction.editReply({ content: '❌ | No music is currently playing!', ephemeral: true });
        }

        const progress = queue.node.getTimestamp();
        const progressBar = queue.node.createProgressBar();

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🎶 Now Playing')
            .setDescription(`**[${track.title}](${track.url})**`)
            .setThumbnail(track.thumbnail)
            .addFields(
                { name: 'Author', value: track.author, inline: true },
                { name: 'Requested by', value: track.requestedBy.toString(), inline: true },
                { name: 'Duration', value: track.duration, inline: true }, 
                { name: '\u200b', value: '\u200b' }, // Spacer
                { name: 'Progress', value: `${progressBar}`, inline: false },
            )
            .setFooter({ text: `Volume: ${queue.node.volume}% | Loop: ${queue.repeatMode === 0 ? 'Off' : queue.repeatMode === 1 ? 'Track' : 'Queue'}` })
            .setTimestamp();

        return await interaction.editReply({ embeds: [embed] });
    },
}; 