const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Removes a song from the queue.')
        .addIntegerOption(option =>
            option.setName('tracknumber')
                .setDescription('The number of the track to remove (from /queue)')
                .setRequired(true)
                .setMinValue(1)
        ),
    async execute(interaction, player) {
        await interaction.deferReply();
        const queue = player.nodes.get(interaction.guildId);

        if (!queue || (!queue.isPlaying() && queue.tracks.size === 0)) {
            return await interaction.editReply({ content: '❌ | There is no music in the queue!', ephemeral: true });
        }

        if (!interaction.member.voice.channel) {
            return await interaction.editReply({ content: '❌ | You need to be in a voice channel to use this command!', ephemeral: true });
        }

        const trackNumber = interaction.options.getInteger('tracknumber', true);

        if (trackNumber > queue.tracks.size) {
            return await interaction.editReply({ content: `❌ | Invalid track number. There are only ${queue.tracks.size} songs in the queue.`, ephemeral: true });
        }

        // trackNumber is 1-based, but array is 0-based
        const removedTrack = queue.node.remove(trackNumber -1); // discord-player v6 uses queue.node.remove(), older versions might use queue.remove()

        const embed = new EmbedBuilder()
            .setColor(removedTrack ? 0x00FF00 : 0xFF0000)
            .setTitle(removedTrack ? '🗑️ Track Removed' : '❌ Removal Failed');

        if (removedTrack) {
            embed.setDescription(`Removed **${removedTrack.title}** from the queue.`)
                 .setThumbnail(removedTrack.thumbnail);
        } else {
            embed.setDescription('Could not remove the specified track. It might have already been played or removed, or the number was invalid.');
        }

        return await interaction.editReply({ embeds: [embed] });
    },
};
