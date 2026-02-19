const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('إدارة إعدادات البوت (config.json)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('عرض الإعدادات الحالية'))
        .addSubcommand(sub => sub
            .setName('add_admin_role') // تم التغيير من set_role
            .setDescription('إضافة رتبة أدمن جديدة')
            .addRoleOption(opt => opt.setName('role').setDescription('الرتبة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('remove_admin_role') // أمر فرعي جديد
            .setDescription('إزالة رتبة أدمن')
            .addRoleOption(opt => opt.setName('role').setDescription('الرتبة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('set_channel')
            .setDescription('تعيين معرف قناة')
            .addStringOption(opt => opt.setName('type').setDescription('نوع القناة').setRequired(true)
                .addChoices(
                    { name: 'Ticket Category', value: 'ticketCategoryId' },
                    { name: 'Log Channel', value: 'logChannelId' },
                    { name: 'Stats Channel', value: 'statsChannelId' },
                    { name: 'Admin Channel', value: 'adminChannelId' }
                ))
            .addChannelOption(opt => opt.setName('channel').setDescription('القناة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('add_high_admin')
            .setDescription('إضافة رتبة إلى الإدارة العليا')
            .addRoleOption(opt => opt.setName('role').setDescription('الرتبة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('remove_high_admin')
            .setDescription('إزالة رتبة من الإدارة العليا')
            .addStringOption(opt => opt.setName('role_id').setDescription('معرف الرتبة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('set_role_icon')
            .setDescription('تعيين أيقونة لرتبة معينة')
            .addRoleOption(opt => opt.setName('role').setDescription('الرتبة').setRequired(true))
            .addStringOption(opt => opt.setName('icon').setDescription('الأيقونة (Emoji)').setRequired(true)))
        .addSubcommand(sub => sub // الأمر الفرعي الجديد المطلوب
            .setName('remove_role_icon')
            .setDescription('إزالة أيقونة من رتبة معينة')
            .addRoleOption(opt => opt.setName('role').setDescription('الرتبة التي تريد إزالة أيقونتها').setRequired(true))),

    async execute(interaction) {
        const configPath = path.join(__dirname, '..', '..', 'config.json');
        let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // التأكد من أن المصفوفات موجودة في الكونفق لتجنب الأخطاء
        if (!config.adminRoleIds) config.adminRoleIds = [];
        if (!config.highAdminRoleIds) config.highAdminRoleIds = [];
        if (!config.roleIcons) config.roleIcons = {};


        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            const embed = new EmbedBuilder()
                .setTitle('⚙️ إعدادات البوت الحالية')
                .setColor(0x5865F2)
                .addFields(
                    // عرض جميع رتب الأدمن
                    { name: 'Admin Roles', value: config.adminRoleIds.map(id => `<@&${id}>`).join(', ') || 'لا يوجد' },
                    { name: 'Ticket Category', value: config.ticketCategoryId ? `<#${config.ticketCategoryId}>` : 'لا يوجد', inline: true },
                    { name: 'Log Channel', value: config.logChannelId ? `<#${config.logChannelId}>` : 'لا يوجد', inline: true },
                    { name: 'Stats Channel', value: config.statsChannelId ? `<#${config.statsChannelId}>` : 'لا يوجد', inline: true },
                    { name: 'Admin Channel', value: config.adminChannelId ? `<#${config.adminChannelId}>` : 'لا يوجد', inline: true },
                    { name: 'High Admin Roles', value: config.highAdminRoleIds.map(id => `<@&${id}>`).join(', ') || 'لا يوجد' }
                );
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'add_admin_role') {
            const role = interaction.options.getRole('role');
            if (!config.adminRoleIds.includes(role.id)) {
                config.adminRoleIds.push(role.id);
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                return interaction.reply({ content: `✅ تم إضافة ${role} إلى رتب الأدمن.`, ephemeral: true });
            }
            return interaction.reply({ content: 'هذه الرتبة موجودة بالفعل في قائمة الأدمن.', ephemeral: true });
        }

        if (subcommand === 'remove_admin_role') {
            const role = interaction.options.getRole('role');
            const initialLength = config.adminRoleIds.length;
            config.adminRoleIds = config.adminRoleIds.filter(id => id !== role.id);
            if (config.adminRoleIds.length < initialLength) {
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                return interaction.reply({ content: `✅ تم إزالة ${role} من رتب الأدمن.`, ephemeral: true });
            }
            return interaction.reply({ content: 'هذه الرتبة غير موجودة في قائمة الأدمن.', ephemeral: true });
        }

        if (subcommand === 'set_channel') {
            const type = interaction.options.getString('type');
            const channel = interaction.options.getChannel('channel');
            config[type] = channel.id;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            return interaction.reply({ content: `✅ تم تعيين **${type}** إلى ${channel}`, ephemeral: true });
        }

        if (subcommand === 'add_high_admin') {
            const role = interaction.options.getRole('role');
            if (!config.highAdminRoleIds.includes(role.id)) {
                config.highAdminRoleIds.push(role.id);
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                return interaction.reply({ content: `✅ تم إضافة ${role} إلى رتب الإدارة العليا.`, ephemeral: true });
            }
            return interaction.reply({ content: 'هذه الرتبة موجودة بالفعل.', ephemeral: true });
        }

        if (subcommand === 'remove_high_admin') {
            const roleId = interaction.options.getString('role_id');
            config.highAdminRoleIds = config.highAdminRoleIds.filter(id => id !== roleId);
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            return interaction.reply({ content: `✅ تم إزالة الرتبة ذات المعرف \`${roleId}\` من الإدارة العليا.`, ephemeral: true });
        }

        if (subcommand === 'set_role_icon') {
            const role = interaction.options.getRole('role');
            const icon = interaction.options.getString('icon');
            config.roleIcons[role.id] = icon;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            return interaction.reply({ content: `✅ تم تعيين الأيقونة ${icon} للرتبة ${role}`, ephemeral: true });
        }

        if (subcommand === 'remove_role_icon') {
            const role = interaction.options.getRole('role');
            if (config.roleIcons && config.roleIcons[role.id]) {
                delete config.roleIcons[role.id];
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                return interaction.reply({ content: `✅ تم إزالة الأيقونة من الرتبة ${role}.`, ephemeral: true });
            }
            return interaction.reply({ content: `لا توجد أيقونة معينة لهذه الرتبة.`, ephemeral: true });
        }
    }
};