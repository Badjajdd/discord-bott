const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('إنشاء لوحة تذاكر الدعم الفني')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const dbPath = path.join(__dirname, '..', '..', 'database.json');
            
            // التأكد من وجود الملف قبل القراءة
            if (!fs.existsSync(dbPath)) {
                fs.writeFileSync(dbPath, JSON.stringify({ categories: {} }, null, 2));
            }

            let db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            const categories = db.categories || {};

            if (Object.keys(categories).length === 0) {
                return interaction.editReply({ content: ' لا توجد أقسام مضافة في النظام حالياً. يرجى إضافة أقسام باستخدام أمر `/categories add` أولاً.' });
            }

            const setupEmbed = new EmbedBuilder()
                .setColor(0xFFC300)
                .setTitle('مرحبًا بكم في قسم تذاكر مجتمع هيـــل | SA')
                .setDescription(
                    "*US | Welcome to the Hell Community Tickets section. Here you can open a ticket.*\n\n" +
                    "**الشروط والأحكام | Terms and Conditions**\n\n" +
                    "**- في حالة إهمال التذكرة لمدة تزيد عن ساعة، سيتم قفل التذكرة تلقائيًا.**\n" +
                    "*If the ticket is neglected for more than an hour, the ticket will be automatically locked.*\n\n" +
                    "**- فتح تذكرة بدون سبب يعرضك للعقوبات.**\n" +
                    "*Opening a ticket without a reason will result in penalties.*\n\n" +
                    "**- يمنع فتح تذكرة لطلب الرتب أو العملات الرقمية.**\n" +
                    "*Opening a ticket to request ranks or cryptocurrencies is prohibited.*\n\n" +
                    "**- عند فتح تذكرة للشكوى ضد أحد الأعضاء المخالفين للمجتمع، يجب عليك تقديم كافة الأدلة. ويمنع الاسفزاز**\n" +
                    "*When opening a complaint ticket against a member who is violating the community, you must provide all evidence.*\n\n" +
                    "**وأخيرا، اختر القسم المناسب.**\n" +
                    "*Finally, choose the appropriate section.*\n\n" +
                    "[Privacy Policy](https://discord.com/privacy ) | [Community Guidelines](https://discord.com/guidelines ) | [Terms of Service](https://discord.com/terms )"
                )
                .setImage('https://cdn.discordapp.com/attachments/1453070859974476037/1463296743679721503/bPb1hH3.png?ex=697150ca&is=696fff4a&hm=0a03e01622a9124f41e61948998960ffbd68b4d6ffea070e6889f262f8a2d207&');

            const options = Object.entries(categories).map(([id, data]) => ({
                label: data.name,
                value: id
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('ticket_select')
                .setPlaceholder('اختر قسم التذكره المطلوب')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.channel.send({ embeds: [setupEmbed], components: [row] });
            await interaction.editReply({ content: '✅ تم إنشاء لوحة التذاكر بنجاح.' });
        } catch (error) {
            console.error('Setup Error:', error);
            await interaction.editReply({ content: '❌ حدث خطأ أثناء إنشاء اللوحة.' });
        }
    },
};
