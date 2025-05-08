# MoonarohBot-Rewrite

A Discord music bot powered by discord-player with extensive music playback capabilities.

## Features

- Music playback from various sources (YouTube, Spotify, etc.)
- Queue management
- Command-based interface
- Easy setup and deployment

## Installation

1. Clone the repository
   ```
   git clone https://github.com/YOUR-USERNAME/MoonarohBot-Rewrite.git
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
   CLIENT_ID=your_discord_application_id
   GUILD_ID=your_discord_server_id
   ```

4. Register bot commands
   ```
   npm run register
   ```

5. Start the bot
   ```
   npm start
   ```

## Commands

- Deploy the bot commands using `npm run register`
- Run the bot in development mode with `npm run dev`
- Start the bot with `npm start`

## Technologies

- [discord.js](https://discord.js.org/) - Discord API wrapper
- [discord-player](https://discord-player.js.org/) - Music player framework
- Node.js

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 