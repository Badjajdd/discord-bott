require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('🔍 جارٍ البحث عن ملفات الأوامر...');

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        if (command && command.data) {
            commands.push(command.data.toJSON());
            console.log(`  ✅ تم العثور على الأمر: ${command.data.name}`);
        } else {
            console.log(`  ⚠️ تم تجاهل الملف: ${file} (لا يحتوي على خاصية "data")`);
        }
    } catch (error) {
        console.error(`❌ حدث خطأ أثناء تحميل الملف: ${file}`, error);
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    if (commands.length === 0) {
        console.log('لم يتم العثور على أي أوامر صالحة للتسجيل.');
        return;
    }

    try {
        console.log(`\n🚀 بدأ تحديث ${commands.length} من أوامر التطبيق (/).`);
        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        console.log(`🎉 تم إعادة تحميل ${data.length} من أوامر التطبيق (/) بنجاح.`);
    } catch (error) {
        console.error(error);
    }
})();
