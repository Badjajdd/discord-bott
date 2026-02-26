const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const { adminRoleIds, logChannelId, statsChannelId } = require('../../config.json');
const { generateCaptcha } = require('../utils/captcha');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        const dbPath = path.join(__dirname, '..', '..', 'database.json');
        let db;
        try {
            const data = fs.readFileSync(dbPath, 'utf8');
            db = data ? JSON.parse(data) : { openTickets: {}, ticketCounter: 0, ratings: {}, blocks: {}, categories: {} };
        } catch (e) {
            db = { openTickets: {}, ticketCounter: 0, ratings: {}, blocks: {}, categories: {} };
        }

        const categories = db.categories || {};

        // دالة مساعدة
        const safeErrorReply = async (inter, message) => {
            try {
                if (inter.deferred || inter.replied) {
                    await inter.editReply({ content: message });
                } else {
                    await inter.reply({ content: message, ephemeral: true });
                }
            } catch (err) {
                console.error('فشل إرسال رد الخطأ:', err.message);
            }
        };

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error('خطأ في تنفيذ الأمر:', error);
                await safeErrorReply(interaction, 'حدث خطأ أثناء تنفيذ الأمر!');
            }
        } else if (interaction.isButton()) {
            const configPath = path.join(__dirname, '..', '..', 'config.json');
            let config;
            try {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch (e) {
                config = {};
            }
            if (!config.adminRoleIds) config.adminRoleIds = [];
            if (!config.highAdminRoleIds) config.highAdminRoleIds = [];
            if (!config.roleIcons) config.roleIcons = {};

            // ======= لوحة الأدمن - الأزرار الرئيسية =======
            if (interaction.customId === 'admin_refresh_panel') {
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
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_categories_manage').setLabel('إدارة الأقسام').setEmoji('📂').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('admin_config_manage').setLabel('إعدادات البوت').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('admin_stats_view').setLabel('الإحصائيات').setEmoji('📊').setStyle(ButtonStyle.Success)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_refresh_panel').setLabel('تحديث اللوحة').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row1, row2] });
            }

            // ======= قسم: إدارة الأقسام =======
            if (interaction.customId === 'admin_categories_manage') {
                const catList = Object.entries(db.categories || {});
                const embed = new EmbedBuilder()
                    .setTitle('📂 إدارة الأقسام')
                    .setColor(0x5865F2)
                    .setDescription(catList.length === 0 ? 'لا توجد أقسام مسجلة حالياً.' :
                        catList.map(([id, d]) => `${d.closed ? '🔴' : '🟢'} **${d.name}** \`${id}\``).join('\n'))
                    .setFooter({ text: 'اختر عملية من الأزرار أدناه' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_cat_add').setLabel('➕ إضافة قسم').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('admin_cat_delete').setLabel('🗑️ حذف قسم').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('admin_cat_edit').setLabel('✏️ تعديل قسم').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('admin_cat_toggle').setLabel('🔄 فتح/إغلاق').setStyle(ButtonStyle.Secondary)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_back_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row, row2] });
            }

            if (interaction.customId === 'admin_cat_add') {
                const modal = new ModalBuilder().setCustomId('admin_modal_cat_add').setTitle('➕ إضافة قسم جديد');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_id').setLabel('معرف القسم (مثال: ticket_support)').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_name').setLabel('اسم القسم').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_category_id').setLabel('معرف فئة القنوات (Category ID)').setStyle(TextInputStyle.Short).setRequired(true))
                );
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'admin_cat_delete') {
                const catList = Object.entries(db.categories || {});
                if (catList.length === 0) return interaction.reply({ content: 'لا توجد أقسام للحذف.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('admin_modal_cat_delete').setTitle('🗑️ حذف قسم');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_id').setLabel(`معرف القسم للحذف\nالأقسام: ${catList.map(([id]) => id).join(', ')}`).setStyle(TextInputStyle.Short).setRequired(true))
                );
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'admin_cat_edit') {
                const catList = Object.entries(db.categories || {});
                if (catList.length === 0) return interaction.reply({ content: 'لا توجد أقسام للتعديل.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('admin_modal_cat_edit').setTitle('✏️ تعديل قسم');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('current_id').setLabel(`المعرف الحالي للقسم\nالأقسام: ${catList.map(([id]) => id).join(', ')}`).setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel('الاسم الجديد (اتركه فارغاً للإبقاء)').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_category_id').setLabel('Category ID الجديد (اتركه فارغاً للإبقاء)').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'admin_cat_toggle') {
                const catList = Object.entries(db.categories || {});
                if (catList.length === 0) return interaction.reply({ content: 'لا توجد أقسام.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('admin_modal_cat_toggle').setTitle('🔄 فتح/إغلاق قسم');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_id').setLabel(`معرف القسم\nالأقسام: ${catList.map(([id, d]) => `${id}(${d.closed ? 'مغلق' : 'مفتوح'})`).join(', ')}`).setStyle(TextInputStyle.Short).setRequired(true))
                );
                return interaction.showModal(modal);
            }

            // ======= قسم: إعدادات البوت =======
            if (interaction.customId === 'admin_config_manage') {
                const adminRoles = config.adminRoleIds.map(id => `<@&${id}>`).join(', ') || 'لا يوجد';
                const highAdminRoles = config.highAdminRoleIds.map(id => `<@&${id}>`).join(', ') || 'لا يوجد';
                const embed = new EmbedBuilder()
                    .setTitle('⚙️ إعدادات البوت')
                    .setColor(0xFFA500)
                    .addFields(
                        { name: '👮 رتب الأدمن', value: adminRoles },
                        { name: '👑 رتب الإدارة العليا', value: highAdminRoles },
                        { name: '📁 Ticket Category', value: config.ticketCategoryId ? `\`${config.ticketCategoryId}\`` : 'غير محدد', inline: true },
                        { name: '📋 Log Channel', value: config.logChannelId ? `<#${config.logChannelId}>` : 'غير محدد', inline: true },
                        { name: '📊 Stats Channel', value: config.statsChannelId ? `<#${config.statsChannelId}>` : 'غير محدد', inline: true },
                        { name: '🔧 Admin Channel', value: config.adminChannelId ? `<#${config.adminChannelId}>` : 'غير محدد', inline: true }
                    )
                    .setFooter({ text: 'اختر عملية من الأزرار أدناه' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_cfg_add_role').setLabel('➕ إضافة رتبة أدمن').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('admin_cfg_remove_role').setLabel('➖ إزالة رتبة أدمن').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('admin_cfg_set_channel').setLabel('📌 تعيين قناة').setStyle(ButtonStyle.Primary)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_cfg_role_icon').setLabel('🎨 أيقونة رتبة').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('admin_back_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row, row2] });
            }

            if (interaction.customId === 'admin_cfg_add_role') {
                const modal = new ModalBuilder().setCustomId('admin_modal_cfg_add_role').setTitle('➕ إضافة رتبة أدمن');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('معرف الرتبة (Role ID)').setStyle(TextInputStyle.Short).setRequired(true))
                );
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'admin_cfg_remove_role') {
                const modal = new ModalBuilder().setCustomId('admin_modal_cfg_remove_role').setTitle('➖ إزالة رتبة أدمن');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel(`معرف الرتبة للإزالة\nالرتب الحالية: ${config.adminRoleIds.join(', ') || 'لا يوجد'}`).setStyle(TextInputStyle.Short).setRequired(true))
                );
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'admin_cfg_set_channel') {
                const modal = new ModalBuilder().setCustomId('admin_modal_cfg_set_channel').setTitle('📌 تعيين قناة');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('channel_type').setLabel('نوع القناة: logChannelId / statsChannelId / adminChannelId / ticketCategoryId').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('channel_id').setLabel('معرف القناة (Channel/Category ID)').setStyle(TextInputStyle.Short).setRequired(true)
                    )
                );
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'admin_cfg_role_icon') {
                const modal = new ModalBuilder().setCustomId('admin_modal_cfg_role_icon').setTitle('🎨 تعيين أيقونة لرتبة');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('معرف الرتبة (Role ID)').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('icon').setLabel('الأيقونة (Emoji) - اتركه فارغاً للإزالة').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return interaction.showModal(modal);
            }

            // ======= قسم: الإحصائيات =======
            if (interaction.customId === 'admin_stats_view') {
                const ratings = db.ratings || {};
                const totalTickets = db.ticketCounter || 0;
                const openTickets = Object.keys(db.openTickets || {}).length;

                let staffStats = '';
                if (Object.keys(ratings).length === 0) {
                    staffStats = 'لا توجد تقييمات مسجلة بعد.';
                } else {
                    staffStats = await Promise.all(Object.entries(ratings).map(async ([staffId, data]) => {
                        const totalVotes = Object.values(data.details || {}).reduce((a, b) => a + b, 0);
                        const avg = totalVotes > 0 ? (data.score / totalVotes).toFixed(1) : '0.0';
                        let starEmoji = '⭐';
                        if (parseFloat(avg) >= 4.5) starEmoji = '🌟';
                        else if (parseFloat(avg) >= 3) starEmoji = '⭐';
                        else starEmoji = '💔';
                        const user = await client.users.fetch(staffId).catch(() => null);
                        const name = user ? `${user.username}` : staffId;
                        return `${starEmoji} **${name}** | التقييم: ${avg}/5 | عدد التقييمات: ${totalVotes} | التذاكر: ${data.acceptedTickets || 0}`;
                    })).then(arr => arr.join('\n'));
                }

                const embed = new EmbedBuilder()
                    .setTitle('📊 إحصائيات البوت')
                    .setColor(0x57F287)
                    .addFields(
                        { name: '🎫 إجمالي التذاكر', value: `${totalTickets}`, inline: true },
                        { name: '🔓 التذاكر المفتوحة', value: `${openTickets}`, inline: true },
                        { name: '📂 عدد الأقسام', value: `${Object.keys(db.categories || {}).length}`, inline: true },
                        { name: '👮 تقييمات الموظفين', value: staffStats }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_back_main').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }

            // ======= زر الرجوع =======
            if (interaction.customId === 'admin_back_main') {
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
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_categories_manage').setLabel('إدارة الأقسام').setEmoji('📂').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('admin_config_manage').setLabel('إعدادات البوت').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('admin_stats_view').setLabel('الإحصائيات').setEmoji('📊').setStyle(ButtonStyle.Success)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_refresh_panel').setLabel('تحديث اللوحة').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row1, row2] });
            }

        } else if (interaction.isStringSelectMenu()) {
            try {
                if (interaction.customId === 'ticket_select') {
                    const selectedValue = interaction.values[0];
                    const dept = categories[selectedValue];
                    if (!dept) return interaction.reply({ content: ' هذا القسم لم يعد متاحاً.', ephemeral: true });

                    const blockData = db.blocks[interaction.user.id];
                    if (blockData) {
                        if (blockData.expires === 'permanent' || blockData.expires > Date.now()) {
                            const expiryMsg = blockData.expires === 'permanent' ? 'دائم' : `<t:${Math.floor(blockData.expires / 1000)}:R>`;
                            return interaction.reply({ 
                                content: ` أنت محظور من استخدام نظام التذاكر\n**المدة:** ${expiryMsg}\n**السبب:** ${blockData.reason}`, 
                                ephemeral: true 
                            });
                        } else {
                            delete db.blocks[interaction.user.id];
                            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                        }
                    }

                    if (dept.closed) {
                        return interaction.reply({ content: ` عذراً، قسم **${dept.name}** مغلق حالياً ولا يمكن فتح تذاكر فيه.`, ephemeral: true });
                    }

                    if (db.openTickets[interaction.user.id]) {
                        return interaction.reply({ content: 'لديك تذكرة مفتوحة بالفعل!', ephemeral: true });
                    }

                    const modal = new ModalBuilder()
                        .setCustomId(`ticket_modal_${selectedValue}`)
                        .setTitle(`فتح تذكرة - ${dept.name}`);

                    const problemInput = new TextInputBuilder()
                        .setCustomId('problem_description')
                        .setLabel("يرجى شرح مشكلتك بالتفاصيل")
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(problemInput));
                    await interaction.showModal(modal);

                } else if (interaction.customId === 'transfer_select') {
                    const selectedValue = interaction.values[0];
                    const dept = categories[selectedValue];
                    if (!dept) return interaction.reply({ content: ' هذا القسم لم يعد متاحاً.', ephemeral: true });

                    const ownerId = Object.keys(db.openTickets).find(id => db.openTickets[id].channelId === interaction.channel.id);
                    if (!ownerId) return;

                    await interaction.deferUpdate(); //  بدء تحديث التفاعل لتجنب انتهاء الصلاحية

                    try {
                        const newCaptcha = generateCaptcha();
                        const attachment = new AttachmentBuilder(newCaptcha.buffer, { name: 'new_captcha.png' });
                        
                        if (dept.categoryId) {
                            await interaction.channel.setParent(dept.categoryId, { lockPermissions: false });
                        }
                        
                        db.openTickets[ownerId].department = dept.name;
                        db.openTickets[ownerId].verified = false;
                        db.openTickets[ownerId].captchaCode = newCaptcha.code;
                        db.openTickets[ownerId].claimedBy = null;
                        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

                        await interaction.editReply({ 
                            embeds: [new EmbedBuilder().setColor(0x3498DB).setDescription(` تم نقل التذكرة من قبل ${interaction.user} إلى قسم: **${dept.name}**`)], 
                            components: [],
                            files: [attachment]
                        });
                        await interaction.channel.send({ content: (adminRoleIds || []).map(id => `<@&${id}>`).join(' '), embeds: [new EmbedBuilder().setColor(0x3498DB).setImage('attachment://new_captcha.png')], files: [attachment] });
                        
                        const user = await client.users.fetch(ownerId).catch(() => null);
                        if (user) {
                            await user.send(` **تنبيه:** تم نقل تذكرتك إلى قسم: **${dept.name}**\nيرجى الانتظار وسيتم الرد عليك قريباً.`).catch(() => {});
                        }
                    } catch (err) {
                        console.error('خطأ في نقل التذكرة:', err);
                    }
                } else if (interaction.customId === 'rating_select') {
                    const [ratingValue, staffId, ticketId] = interaction.values[0].split('_');
                    const ratingNames = {
                        'excellent': 'ممتاز',
                        'verygood': 'جيد جدا',
                        'good': 'جيد',
                        'neutral': 'ليس جيد وليس سيئ',
                        'bad': 'سيئ'
                    };

                    if (!db.ratings[staffId]) {
                        db.ratings[staffId] = { score: 0, acceptedTickets: 0, details: { excellent: 0, verygood: 0, good: 0, neutral: 0, bad: 0 } };
                    }

                    db.ratings[staffId].details[ratingValue]++;
                    const scores = { 'excellent': 5, 'verygood': 4, 'good': 3, 'neutral': 2, 'bad': 1 };
                    db.ratings[staffId].score += scores[ratingValue];

                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

                    await interaction.update({ content: ` شكراً لك على تقييمك! لقد قمت بتقييم التجربة بـ **${ratingNames[ratingValue]}**.`, components: [] });
                    
                    const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
                    if (logChannel) {
                        const staff = await client.users.fetch(staffId).catch(() => ({ tag: staffId }));
                        const logEmbed = new EmbedBuilder()
                            .setColor(0x57F287)
                            .setTitle('🌟 تقييم جديد')
                            .addFields(
                                { name: 'الموظف', value: `${staff.tag || staffId}`, inline: true },
                                { name: 'العميل', value: `${interaction.user.tag}`, inline: true },
                                { name: 'التقييم', value: ratingNames[ratingValue], inline: true },
                                { name: 'رقم التذكرة', value: `#${ticketId}`, inline: true }
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                } else if (interaction.customId === 'report_select') {
                    const selectedValue = interaction.values[0];
                    const dept = categories[selectedValue];
                    if (!dept) return interaction.reply({ content: ' هذا القسم لم يعد متاحاً.', ephemeral: true });

                    const blockData = db.blocks[interaction.user.id];
                    if (blockData) {
                        if (blockData.expires === 'permanent' || blockData.expires > Date.now()) {
                            return interaction.reply({ content: ` أنت محظور من استخدام نظام التذاكر.`, ephemeral: true });
                        }
                    }

                    if (db.openTickets[interaction.user.id]) {
                        return interaction.reply({ content: 'لديك تذكرة مفتوحة بالفعل!', ephemeral: true });
                    }

                    const modal = new ModalBuilder()
                        .setCustomId(`ticket_modal_${selectedValue}`)
                        .setTitle(`فتح بلاغ - ${dept.name}`);

                    const problemInput = new TextInputBuilder()
                        .setCustomId('problem_description')
                        .setLabel("يرجى شرح البلاغ بالتفاصيل")
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(problemInput));
                    await interaction.showModal(modal);
                }
            } catch (error) {
                console.error('خطأ في معالجة القائمة المنسدلة:', error);
                await safeErrorReply(interaction, 'حدث خطأ أثناء معالجة اختيارك.');
            }

        } else if (interaction.isModalSubmit()) {
            const configPath = path.join(__dirname, '..', '..', 'config.json');

            // ======= Modals الخاصة بالأدمن بانل =======

            if (interaction.customId === 'admin_modal_cat_add') {
                const id = interaction.fields.getTextInputValue('cat_id').trim();
                const name = interaction.fields.getTextInputValue('cat_name').trim();
                const categoryId = interaction.fields.getTextInputValue('cat_category_id').trim();
                if (db.categories[id]) {
                    return interaction.reply({ content: `❌ المعرف \`${id}\` موجود بالفعل.`, ephemeral: true });
                }
                db.categories[id] = { name, categoryId, closed: false };
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                return interaction.reply({ content: `✅ تم إضافة القسم **${name}** بنجاح!\nالمعرف: \`${id}\` | Category ID: \`${categoryId}\``, ephemeral: true });
            }

            if (interaction.customId === 'admin_modal_cat_delete') {
                const id = interaction.fields.getTextInputValue('cat_id').trim();
                if (!db.categories[id]) return interaction.reply({ content: `❌ القسم \`${id}\` غير موجود.`, ephemeral: true });
                const name = db.categories[id].name;
                delete db.categories[id];
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                return interaction.reply({ content: `✅ تم حذف القسم **${name}** (\`${id}\`) نهائياً.`, ephemeral: true });
            }

            if (interaction.customId === 'admin_modal_cat_edit') {
                const currentId = interaction.fields.getTextInputValue('current_id').trim();
                const newName = interaction.fields.getTextInputValue('new_name').trim();
                const newCategoryId = interaction.fields.getTextInputValue('new_category_id').trim();
                if (!db.categories[currentId]) return interaction.reply({ content: `❌ القسم \`${currentId}\` غير موجود.`, ephemeral: true });
                if (newName) db.categories[currentId].name = newName;
                if (newCategoryId) db.categories[currentId].categoryId = newCategoryId;
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                return interaction.reply({ content: `✅ تم تحديث القسم **${db.categories[currentId].name}** بنجاح.`, ephemeral: true });
            }

            if (interaction.customId === 'admin_modal_cat_toggle') {
                const id = interaction.fields.getTextInputValue('cat_id').trim();
                if (!db.categories[id]) return interaction.reply({ content: `❌ القسم \`${id}\` غير موجود.`, ephemeral: true });
                db.categories[id].closed = !db.categories[id].closed;
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                const status = db.categories[id].closed ? '🔴 مغلق' : '🟢 مفتوح';
                return interaction.reply({ content: `✅ تم تغيير حالة القسم **${db.categories[id].name}** إلى: ${status}`, ephemeral: true });
            }

            if (interaction.customId === 'admin_modal_cfg_add_role') {
                let cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (!cfg.adminRoleIds) cfg.adminRoleIds = [];
                const roleId = interaction.fields.getTextInputValue('role_id').trim();
                if (cfg.adminRoleIds.includes(roleId)) return interaction.reply({ content: 'هذه الرتبة موجودة بالفعل في قائمة الأدمن.', ephemeral: true });
                cfg.adminRoleIds.push(roleId);
                fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
                return interaction.reply({ content: `✅ تم إضافة الرتبة \`${roleId}\` إلى رتب الأدمن.`, ephemeral: true });
            }

            if (interaction.customId === 'admin_modal_cfg_remove_role') {
                let cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (!cfg.adminRoleIds) cfg.adminRoleIds = [];
                const roleId = interaction.fields.getTextInputValue('role_id').trim();
                const before = cfg.adminRoleIds.length;
                cfg.adminRoleIds = cfg.adminRoleIds.filter(id => id !== roleId);
                if (cfg.adminRoleIds.length === before) return interaction.reply({ content: 'هذه الرتبة غير موجودة في قائمة الأدمن.', ephemeral: true });
                fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
                return interaction.reply({ content: `✅ تم إزالة الرتبة \`${roleId}\` من رتب الأدمن.`, ephemeral: true });
            }

            if (interaction.customId === 'admin_modal_cfg_set_channel') {
                let cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                const type = interaction.fields.getTextInputValue('channel_type').trim();
                const channelId = interaction.fields.getTextInputValue('channel_id').trim();
                const allowed = ['logChannelId', 'statsChannelId', 'adminChannelId', 'ticketCategoryId'];
                if (!allowed.includes(type)) return interaction.reply({ content: `❌ النوع \`${type}\` غير صحيح. الأنواع المتاحة: ${allowed.join(', ')}`, ephemeral: true });
                cfg[type] = channelId;
                fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
                return interaction.reply({ content: `✅ تم تعيين **${type}** إلى \`${channelId}\``, ephemeral: true });
            }

            if (interaction.customId === 'admin_modal_cfg_role_icon') {
                let cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (!cfg.roleIcons) cfg.roleIcons = {};
                const roleId = interaction.fields.getTextInputValue('role_id').trim();
                const icon = interaction.fields.getTextInputValue('icon').trim();
                if (!icon) {
                    delete cfg.roleIcons[roleId];
                    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
                    return interaction.reply({ content: `✅ تم إزالة الأيقونة من الرتبة \`${roleId}\`.`, ephemeral: true });
                }
                cfg.roleIcons[roleId] = icon;
                fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
                return interaction.reply({ content: `✅ تم تعيين الأيقونة ${icon} للرتبة \`${roleId}\`.`, ephemeral: true });
            }

            if (interaction.customId.startsWith('ticket_modal_')) {
                const deptKey = interaction.customId.replace('ticket_modal_', '');
                const dept = categories[deptKey];
                if (!dept) return interaction.reply({ content: ' حدث خطأ، القسم غير موجود.', ephemeral: true });
                
                const problemDescription = interaction.fields.getTextInputValue('problem_description');

                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.deferReply({ ephemeral: true });
                    }
                    const ticketId = ++db.ticketCounter;
                    const captcha = generateCaptcha();
                    const attachment = new AttachmentBuilder(captcha.buffer, { name: 'captcha.png' });
                    
                    const guild = interaction.guild || client.guilds.cache.get(require('../../config.json').guildId);
                    const parentId = dept.categoryId || require('../../config.json').ticketCategoryId;

                    const channel = await guild.channels.create({
                        name: `ticket-${ticketId}`,
                        type: ChannelType.GuildText,
                        parent: parentId,
                        permissionOverwrites: [
                            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                            ...(adminRoleIds || []).map(roleId => ({
                                id: roleId,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
                            })),
                            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                        ]
                    });

                    db.openTickets[interaction.user.id] = { 
                        channelId: channel.id, 
                        ticketId: ticketId, 
                        department: dept.name, 
                        problem: problemDescription,
                        openedAt: Date.now(), 
                        claimedBy: null,
                        captchaCode: captcha.code,
                        verified: false
                    };
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

                    const welcomeMessage = `تم إنشاء التذكرة الخاصة بِك\n**رقم الشكوى الخاصة بِك:** #${ticketId}\nيرجى شرح مشكلتك بالتفاصيل وارسال الأدلة إن وجدت .`;
                    await interaction.user.send(welcomeMessage).catch(() => {});

                    const welcomeEmbed = new EmbedBuilder()
                        .setColor(0xFFC300)
                        .setTitle(`تذكرة جديدة #${ticketId}`)
                        .setDescription(`صاحب التذكرة ${interaction.user}`)
                        .setImage('attachment://captcha.png')
                        .addFields(
                            { name: 'القسم', value: dept.name, inline: true },
                            { name: 'وصف المشكلة', value: problemDescription, inline: false }
                        )
                        .setTimestamp();

                    const sentMsg = await channel.send({ content: `${(adminRoleIds || []).map(id => `<@&${id}>`).join(' ')} تذكرة جديدة!`, embeds: [welcomeEmbed], files: [attachment] });
                    
                    try {
                        await sentMsg.pin();
                    } catch (pinError) {
                        console.error('فشل تثبيت الرسالة:', pinError);
                    }

                    await interaction.editReply({ content: ` تم فتح تذكرتك بنجاح في قسم **${dept.name}**. تحقق من رسائلك الخاصة للمزيد من التفاصيل.` });
                } catch (err) {
                    console.error('خطأ في فتح التذكرة:', err);
                    await safeErrorReply(interaction, 'حدث خطأ أثناء فتح التذكرة.');
                }
            }
        }
    },
};
