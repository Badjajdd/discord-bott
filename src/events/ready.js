// src/events/ready.js

const { Events } = require('discord.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`✅ جاهز! تم تسجيل الدخول باسم ${client.user.tag}`);
        console.log(`🚀 نظام ModMail جاهز للعمل!`);
	},
};
