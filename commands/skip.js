const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Store active vote sessions per guild
const voteSkipSessions = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips the current song or votes to skip.'),
    async execute(interaction, player) {
        await interaction.deferReply();
        const queue = player.nodes.get(interaction.guildId);

        if (!queue || !queue.isPlaying()) {
            return await interaction.editReply({ content: '❌ | No music is being played!', ephemeral: true });
        }

        if (!interaction.member.voice.channel) {
            return await interaction.editReply({ content: '❌ | You need to be in a voice channel to use this command!', ephemeral: true });
        }

        // Check if user is admin (can bypass vote requirement)
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || 
                        interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

        // Get voice channel members (excluding bots)
        const voiceMembers = interaction.member.voice.channel.members.filter(member => !member.user.bot);
        const totalMembers = voiceMembers.size;

        // If only 1 user or user is admin, skip immediately
        if (totalMembers <= 1 || isAdmin) {
            const currentTrack = queue.currentTrack;
            const success = queue.node.skip();

            const embed = new EmbedBuilder()
                .setColor(success ? 0x00FF00 : 0xFF0000)
                .setTitle(success ? '⏭️ Song Skipped' : '❌ Skip Failed')
                .setDescription(success ? `${isAdmin ? 'Admin skip: ' : ''}Skipped **${currentTrack?.title || 'the current song'}**.` : 'Could not skip the song.')
                .setTimestamp();
            
            if (currentTrack) {
                embed.setThumbnail(currentTrack.thumbnail);
            }

            // Clear any existing vote session
            voteSkipSessions.delete(interaction.guildId);

            return await interaction.editReply({ embeds: [embed] });
        }

        // Vote to skip logic for multiple users
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const currentTrack = queue.currentTrack;

        // Initialize or get existing vote session
        if (!voteSkipSessions.has(guildId)) {
            voteSkipSessions.set(guildId, {
                votes: new Set(),
                trackId: currentTrack?.id || currentTrack?.url,
                startTime: Date.now()
            });
        }

        const voteSession = voteSkipSessions.get(guildId);

        // Check if this is for the same track (reset votes if track changed)
        if (voteSession.trackId !== (currentTrack?.id || currentTrack?.url)) {
            voteSession.votes.clear();
            voteSession.trackId = currentTrack?.id || currentTrack?.url;
            voteSession.startTime = Date.now();
        }

        // Add user's vote
        if (voteSession.votes.has(userId)) {
            return await interaction.editReply({ 
                content: '⚠️ | You have already voted to skip this song!', 
                ephemeral: true 
            });
        }

        voteSession.votes.add(userId);
        const votesNeeded = Math.ceil(totalMembers * 0.5);
        const currentVotes = voteSession.votes.size;

        // Check if we have enough votes to skip
        if (currentVotes >= votesNeeded) {
            const success = queue.node.skip();

            const embed = new EmbedBuilder()
                .setColor(success ? 0x00FF00 : 0xFF0000)
                .setTitle(success ? '⏭️ Vote Skip Successful' : '❌ Skip Failed')
                .setDescription(success ? `Vote passed! Skipped **${currentTrack?.title || 'the current song'}**.` : 'Could not skip the song.')
                .addFields(
                    { name: 'Final Vote Count', value: `${currentVotes}/${totalMembers} (${votesNeeded} needed)`, inline: true }
                )
                .setTimestamp();
            
            if (currentTrack) {
                embed.setThumbnail(currentTrack.thumbnail);
            }

            // Clear vote session
            voteSkipSessions.delete(guildId);

            return await interaction.editReply({ embeds: [embed] });
        } else {
            // Not enough votes yet
            const embed = new EmbedBuilder()
                .setColor(0xFFFF00)
                .setTitle('🗳️ Vote to Skip')
                .setDescription(`**${interaction.user.displayName}** voted to skip **${currentTrack?.title || 'the current song'}**.`)
                .addFields(
                    { name: 'Progress', value: `${currentVotes}/${totalMembers} votes (${votesNeeded} needed)`, inline: true },
                    { name: 'Remaining', value: `${votesNeeded - currentVotes} more vote${(votesNeeded - currentVotes) !== 1 ? 's' : ''} needed`, inline: true }
                )
                .setFooter({ text: 'Other users can use /skip to add their vote!' })
                .setTimestamp();
            
            if (currentTrack) {
                embed.setThumbnail(currentTrack.thumbnail);
            }

            return await interaction.editReply({ embeds: [embed] });
        }
    },
}; 