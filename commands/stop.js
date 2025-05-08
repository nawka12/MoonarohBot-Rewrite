const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stops the music, clears the queue, and disconnects the bot.'),
        // Aliases can be handled by registering multiple commands pointing to this file in deploy-commands.js or at interaction level
    async execute(interaction, player) {
        await interaction.deferReply();
        const queue = player.nodes.get(interaction.guildId);

        if (!queue || !queue.connection) {
            return await interaction.editReply({ content: '❌ | I am not in a voice channel or no music is playing!', ephemeral: true });
        }

        // Simplified voice channel check - only verify the member is in a voice channel
        if (!interaction.member.voice.channel) {
            return await interaction.editReply({ content: '❌ | You need to be in a voice channel to use this command!', ephemeral: true });
        }

        queue.delete(); // This stops the player, clears the queue, and disconnects

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🛑 Playback Stopped')
            .setDescription('Music stopped, queue cleared, and I have left the voice channel.')
            .setTimestamp();

        return await interaction.editReply({ embeds: [embed] });
    },
}; 