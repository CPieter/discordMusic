import { MINUTES, leaveVoiceChannel, canJoinVoiceChannel } from '../utils/utils.js';
import { searchSong } from '../utils/music.js';

import { joinVoiceChannel, createAudioPlayer, AudioPlayerStatus } from '@discordjs/voice';

import { EmbedBuilder } from 'discord.js';

import { servers } from '../utils/utils.js';
import { queuedEmbed, defaultEmbed, errorEmbed } from '../utils/embeds.js';

import * as platforms from '../platforms/index.js';

/** @type {import('../index.js').Command} */
export default {
	name: 'play',
	description: 'Play a song',
	aliases: ['p', 'sr'],
	interactionOptions: [
		{
			name: 'song',
			description: 'song name or url',
			type: 3, // type STRING
			required: true
		}
	],
	permissions: {
		memberInVoice: true
	},

	command: async ({ message, args }) => {
		// if no argument is given
		if (args.length < 1) {
			return message.channel.send('Please enter a valid url');
		}

		if (!message.member) return;

		const voiceChannel = message.member.voice.channel;

		if (!voiceChannel) return;

		if (!canJoinVoiceChannel(voiceChannel, message.client.user)) {
			return message.channel.send(
				'I need the permissions to join and speak in your voice channel!'
			);
		}

		getSong(args, message, voiceChannel);
	},

	interaction: async ({ interaction }) => {
		if (!interaction.isCommand()) return;
		const songOption = interaction.options.get('song');
		if (!songOption) return;

		const song = songOption.value?.toString();
		if (!song) return;

		// if no argument is given
		if (song.trim().length < 1) {
			return interaction.reply({
				embeds: [errorEmbed('Please enter a valid argument')],
				ephemeral: true
			});
		}

		if (!interaction.member) return;

		/** @type {import('../').GuildMemberWithVoice} */
		const member = interaction.member;
		/** @type {import('discord.js').VoiceState} */
		const voice = member?.voice;
		const voiceChannel = voice.channel;
		if (!voiceChannel) return;

		if (!canJoinVoiceChannel(voiceChannel, interaction.client.user)) {
			return interaction.reply({
				embeds: [errorEmbed('I need the permissions to join and speak in your voice channel!')],
				ephemeral: true
			});
		}

		getSong([song], interaction, voiceChannel);
	}
};

/** @param {import('../index').Song} song  */
async function getAudioResource(song) {
	const platform = platforms[song.platform + 'Platform']; // TODO: make nicer

	if (!platform) return; // TODO: error handling

	return await platform.getResource(song);
}

/**
 * @param {string[]} args
 * @param {import('discord.js').Message | import('discord.js').Interaction} message
 * @param {import('discord.js').VoiceChannel | import('discord.js').VoiceBasedChannel} voiceChannel
 */
async function getSong(args, message, voiceChannel) {
	if (!message.guild) return;

	// guildqueue creation logic
	if (!servers.has(message.guild.id)) {
		servers.set(message.guild.id, {
			id: message.guild.id,
			textChannel: message.channel,
			voiceChannel: voiceChannel,
			songMessage: null,
			connection: null,
			audioPlayer: null,
			songs: [],
			volume: 5,
			paused: false,
			looping: false
		});
	}

	const server = servers.get(message.guild.id);
	if (!server) return;

	server.textChannel = message.channel; // updated each time a song is added

	// get song data
	const songsData = await searchSong(args); // TODO: inline?

	if (songsData.error) {
		sendErrorMessage(message, songsData.message);
		// send error message
		return;
	}

	// send message
	if (songsData.songs.length > 1) {
		sendDefaultMessage(message, `Queued **${songsData.songs.length}** songs`);
	} else {
		sendQueueMessage(message, songsData.songs[0]);
	}

	// add songs to queue
	server.songs.push(...songsData.songs);

	// join vc logic
	try {
		if (!message.member) return;

		const connection = joinVoiceChannel({
			channelId: voiceChannel.id,
			guildId: message.guild.id,
			adapterCreator: message.guild.voiceAdapterCreator
		});

		server.connection = connection;

		if (!server.paused) {
			// play song
			server.paused = false;
			play(message.guild, server.songs[0], server);
		}
	} catch (error) {
		console.error(error);
		leaveVoiceChannel(message.guild.id);
		return message.channel?.send(error);
	}
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('../').Song} song
 * @param {import('../').GuildQueueItem} server
 */
async function play(guild, song, server) {
	if (!song) {
		if (server.songMessage) {
			server.songMessage.delete();
			server.songMessage = null;
		}

		// server.playing = false;

		setTimeout(() => {
			// if still no songs in queue
			if (server.songs.length < 1) {
				// leave voice channel
				if (server.textChannel) {
					// TODO bug send not a function?
					server.textChannel.send('No more songs to play');
				}
				leaveVoiceChannel(guild.id);
			}
		}, 10 * MINUTES);
		return;
	}

	if (!server.audioPlayer) {
		server.audioPlayer = createAudioPlayer();

		// once song finished playing, play next song in queue
		server.audioPlayer.on(AudioPlayerStatus.Idle, () => {
			server.songs.shift();
			play(guild, server.songs[0], server);
		});

		server.audioPlayer.on('error', (error) => {
			console.error(error);
			// play next song
			server.songs.shift();
			play(guild, server.songs[0], server);
		});

		server.connection?.subscribe(server.audioPlayer);
	}

	try {
		const audioResource = await getAudioResource(song);

		if (!audioResource) {
			throw 'No audio';
		}

		server.audioPlayer.play(audioResource);

		const embed = new EmbedBuilder()
			.setTitle('Now Playing')
			.setDescription(
				`[${song.title.length > 60 ? song.title.substring(0, 60 - 1) + '…' : song.title}](${
					song.url
				})`
			);

		// delete old song message
		if (server.songMessage) {
			await server.songMessage.delete();
		}

		// TODO bug send not a function?
		if (server.textChannel) {
			server.songMessage = await server.textChannel.send({
				embeds: [embed]
			});
		}
	} catch (err) {
		console.error(err);
		// couldn't find song/problem getting audio, skip song
		server.songs.shift();
		play(guild, server.songs[0], server);
	}
}

/**
 * @param {import('discord.js').Message | import('discord.js').Interaction} message
 * @param {string} text
 */
function sendDefaultMessage(message, text) {
	if (message?.isCommand) {
		// slash command
		message.reply({
			embeds: [defaultEmbed(text)],
			ephemeral: false
		});
	} else {
		// text command
		message.channel?.send({
			embeds: [defaultEmbed(text)]
		});
	}
}

/**
 * @param {import('discord.js').Message | import('discord.js').Interaction} message
 * @param {import('../index.js').Song} song
 */
function sendQueueMessage(message, song) {
	if (message?.isCommand) {
		// slash command
		message.reply({
			embeds: [queuedEmbed(message, song)],
			ephemeral: false
		});
	} else {
		// text command
		message.channel?.send({ embeds: [queuedEmbed(message, song)] });
	}
}

/**
 * @param {import('discord.js').Message | import('discord.js').Interaction} message
 * @param {string} error
 */
function sendErrorMessage(message, error) {
	if (message?.isCommand) {
		// slash command
		message.reply({
			embeds: [queuedEmbed(message, errorEmbed(error))],
			ephemeral: false
		});
	} else {
		// text command
		message.channel?.send({ embeds: [errorEmbed(error)] });
	}
}
