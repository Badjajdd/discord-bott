const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adminpanel')
        .setDescription('فتح لوحة تحكم الإدارة التفاعلية')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🛠️ لوحة تحكم الإدارة')
            .setDescription('مرحباً بك في لوحة التحكم. استخدم الأزرار أدناه لإدارة إعدادات البوت والأقسام بسهولة دون الحاجة لكتابة أوامر معقدة.')
            .setColor(0x2B2D31)
            .addFields(
                { name: '📂 الأقسام', value: 'إضافة، حذف، أو تعديل أقسام التذاكر.', inline: true },
                { name: '⚙️ الإعدادات', value: 'تعديل الرتب، القنوات، والأيقونات.', inline: true },
                { name: '📊 الإحصائيات', value: 'عرض تقييمات الموظفين وإحصائيات البوت.', inline: true }
            )
            .setTimestamp();

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('admin_categories_manage')
                    .setLabel('إدارة الأقسام')
                    .setEmoji('📂')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('admin_config_manage')
                    .setLabel('إعدادات البوت')
                    .setEmoji('⚙️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('admin_stats_view')
                    .setLabel('الإحصائيات')
                    .setEmoji('📊')
                    .setStyle(ButtonStyle.Success)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('admin_refresh_panel')
                    .setLabel('تحديث اللوحة')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }
};
