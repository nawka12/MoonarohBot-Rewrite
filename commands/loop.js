const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QueueRepeatMode } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Sets the loop mode for the queue.')
        .addIntegerOption(option =>
            option.setName('mode')
                .setDescription('The loop mode to set')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: QueueRepeatMode.OFF },
                    { name: 'Track', value: QueueRepeatMode.TRACK },
                    { name: 'Queue', value: QueueRepeatMode.QUEUE },
                    { name: 'Autoplay (plays related songs after queue ends)', value: QueueRepeatMode.AUTOPLAY }
                )
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

        const loopMode = interaction.options.getInteger('mode', true);
        queue.setRepeatMode(loopMode);
        
        const modeString = () => {
            switch (loopMode) {
                case QueueRepeatMode.OFF:
                    return 'Off';
                case QueueRepeatMode.TRACK:
                    return '🔂 Track';
                case QueueRepeatMode.QUEUE:
                    return '🔁 Queue';
                case QueueRepeatMode.AUTOPLAY:
                    return '▶️ Autoplay';
                default:
                    return 'Unknown';
            }
        };

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔁 Loop Mode Updated')
            .setDescription(`Loop mode set to **${modeString()}**.`)
            .setTimestamp();
        
        if (queue.currentTrack) {
            embed.setThumbnail(queue.currentTrack.thumbnail);
        }

        return await interaction.editReply({ embeds: [embed] });
    },
}; 