const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Adjusts the playback volume.')
        .addIntegerOption(option =>
            option.setName('percentage')
                .setDescription('Volume percentage (0-200). Default is current volume.')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(200) // discord-player default max is 100, but can be configured. Let's allow up to 200 for flexibility.
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

        const volumePercentage = interaction.options.getInteger('percentage');

        if (volumePercentage === null) { // If no percentage is provided, show current volume
            const currentVolume = queue.node.volume;
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🔊 Current Volume')
                .setDescription(`The current volume is **${currentVolume}%**.`)
                .setTimestamp();
            return await interaction.editReply({ embeds: [embed] });
        }

        try {
            const success = queue.node.setVolume(volumePercentage);
            
            const embed = new EmbedBuilder()
                .setColor(success ? 0x00FF00 : 0xFF0000)
                .setTitle(success ? '🔊 Volume Updated' : '❌ Volume Update Failed')
                .setDescription(success ? `Volume set to **${volumePercentage}%**.` : 'Could not update the volume.')
                .setTimestamp();

            return await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[VolumeCommand Error]:', error);
            return await interaction.editReply({ content: '❌ | An error occurred while trying to set the volume.', ephemeral: true });
        }
    },
}; 