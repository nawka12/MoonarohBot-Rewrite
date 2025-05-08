# MoonarohBot-Rewrite

A Discord music bot powered by discord-player with extensive music playback capabilities.

> **Note:** This is a complete rewrite of the original [MoonarohBot](https://github.com/nawka12/MoonarohBot) with improved features and stability.

## Features

- Music playback from various sources (YouTube, Spotify, etc.)
- Queue management
- Command-based interface
- Easy setup and deployment

## Current Limitations

**Note:** Currently, only YouTube is supported as a music source due to issues with the `@discord-player/extractors` packages. Support for additional platforms (Spotify, SoundCloud, etc.) will be added in future updates.

## Installation

1. Clone the repository
   ```
   git clone https://github.com/nawka12/MoonarohBot-Rewrite.git
   cd MoonarohBot-Rewrite
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Set up environment variables
   Create a `.env` file with the following:
   ```
   TOKEN=your_discord_bot_token
   ```

4. Start the bot
   ```
   npm start
   ```

## Commands

- Run the bot in development mode with `npm run dev`
- Start the bot with `npm start`

Note: The bot automatically registers slash commands on startup for all guilds it's in. You don't need to run the register command separately.

## Available Commands

The bot supports the following slash commands:

| Command | Description |
|---------|-------------|
| `/play` | Play a song from YouTube by providing a URL or search query |
| `/pause` | Pauses the current song |
| `/resume` | Resumes playback of a paused song |
| `/skip` | Skips the currently playing song |
| `/stop` | Stops playback, clears the queue, and disconnects the bot |
| `/queue` | Displays the current song queue with pagination |
| `/nowplaying` | Shows information about the currently playing song |
| `/volume` | Adjusts the playback volume (0-200%) |
| `/loop` | Sets the loop mode (Off, Track, Queue, or Autoplay) |
| `/shuffle` | Shuffles the current queue |
| `/remove` | Removes a specific song from the queue |
| `/seek` | Jumps to a specific position in the current song |

## Running with PM2 (Recommended for 24/7 operation)

PM2 is a process manager for Node.js applications that helps keep your bot running continuously.

1. Install PM2 globally
   ```   npm install -g pm2
   ```

2. Start the bot with PM2
   ```
   pm2 start index.js --name "MoonarohBot"
   ```

3. Set up PM2 to start on system boot
   ```
   pm2 startup
   ```
   Follow the instructions shown after running this command.

4. Save the current PM2 process list
   ```
   pm2 save
   ```

5. Useful PM2 commands:
   ```
   pm2 list              # List all processes
   pm2 logs MoonarohBot  # View logs
   pm2 stop MoonarohBot  # Stop the bot
   pm2 restart MoonarohBot # Restart the bot
   pm2 monit             # Monitor CPU and memory usage
   ```

## Technologies

- [discord.js](https://discord.js.org/) - Discord API wrapper
- [discord-player](https://discord-player.js.org/) - Music player framework
- Node.js

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 
