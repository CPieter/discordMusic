module.exports = {
  name: 'queue',
  description: 'Show current queue',
  aliases: ['q'],
  command: (message, arguments, client) => {
    const guildQueue = client.queue.get(message.guild.id);

    if (!guildQueue || guildQueue?.songs.length < 1) {
      return message.channel.send('```nim\nThe queue is empty ;-;\n```');
    }

    const songs = guildQueue.songs.slice(0, 5); // get first 5 songs

    let queueMsg = '```nim\n';

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      if (i === 0) {
        queueMsg += '    ⬐ current track\n';
      }

      queueMsg += `${i + 1}) ${
        song.title.length > 40
          ? song.title.substring(0, 40 - 1) + '…'
          : song.title.padEnd(40, ' ')
      } ${song.duration}\n`;
      // TODO show time left for current song `2:39 left`

      if (i === 0) {
        queueMsg += '    ⬑ current track\n';
      }
    }

    queueMsg += '```';

    return message.channel.send(queueMsg);
  },

  interaction: async (interaction, client) => {
    const guildQueue = client.queue.get(interaction.guild.id);

    if (!guildQueue || guildQueue?.songs.length < 1) {
      return interaction.channel.send('```nim\nThe queue is empty ;-;\n```');
    }

    const songs = guildQueue.songs.slice(0, 5); // get first 5 songs

    let queueMsg = '```nim\n';

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      if (i === 0) {
        queueMsg += '    ⬐ current track\n';
      }

      queueMsg += `${i + 1}) ${
        song.title.length > 40
          ? song.title.substring(0, 40 - 1) + '…'
          : song.title.padEnd(40, ' ')
      } ${song.duration}\n`;
      // TODO show time left for current song `2:39 left`

      if (i === 0) {
        queueMsg += '    ⬑ current track\n';
      }
    }

    queueMsg += '```';

    return interaction.channel.send(queueMsg);
  },
};
