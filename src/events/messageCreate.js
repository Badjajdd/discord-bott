const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { generateCaptcha } = require('../utils/captcha');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        const configPath = path.join(__dirname, '..', '..', 'config.json');
        const dbPath = path.join(__dirname, '..', '..', 'database.json');

        let config = {};
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
            console.error('فشل قراءة ملف config.json:', e);
        }

        let db;
        try {
            const data = fs.readFileSync(dbPath, 'utf8');
            db = data ? JSON.parse(data) : { openTickets: {}, ticketCounter: 0, ratings: {}, blocks: {}, categories: {} };
        } catch (e) {
            db = { openTickets: {}, ticketCounter: 0, ratings: {}, blocks: {}, categories: {} };
        }

        const categories = db.categories || {};

        // ✅ دالة مساعدة محدّثة تستخدم flags بدلاً من ephemeral
        const safeErrorReply = async (inter, message) => {
            try {
                if (inter.deferred || inter.replied) {
                    await inter.editReply({ content: message });
                } else {
                    await inter.reply({ content: message, flags: MessageFlags.Ephemeral });
                }
            } catch (err) {
                console.error('فشل إرسال رد الخطأ:', err.message);
            }
        };

        // ========================
        // أوامر Slash
        // ========================
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error('خطأ في تنفيذ الأمر:', error);
                await safeErrorReply(interaction, 'حدث خطأ أثناء تنفيذ الأمر!');
            }

        // ========================
        // أزرار
        // ========================
        } else if (interaction.isButton()) {
            const adminRoleIds = config.adminRoleIds || [];
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                interaction.member.roles.cache.some(role => adminRoleIds.includes(role.id));

            if (interaction.customId.startsWith('admin_')) {
                if (!isAdmin) {
                    return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام لوحة التحكم.', flags: MessageFlags.Ephemeral });
                }

                // --- إدارة الأقسام ---
                if (interaction.customId === 'admin_categories_manage') {
                    const embed = new EmbedBuilder()
                        .setTitle('📂 إدارة الأقسام')
                        .setDescription('اختر الإجراء المطلوب للأقسام:')
                        .setColor(0x5865F2);

                    const row1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('admin_categories_list').setLabel('عرض الأقسام').setEmoji('📋').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('admin_categories_add_modal').setLabel('إضافة قسم').setEmoji('➕').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('admin_categories_edit_modal').setLabel('تعديل قسم').setEmoji('✏️').setStyle(ButtonStyle.Primary)
                    );
                    const row2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('admin_categories_delete_modal').setLabel('حذف قسم').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('admin_categories_toggle_modal').setLabel('فتح/إغلاق قسم').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('admin_panel_back').setLabel('رجوع').setEmoji('⬅️').setStyle(ButtonStyle.Danger)
                    );
                    return interaction.update({ embeds: [embed], components: [row1, row2] });

                } else if (interaction.customId === 'admin_categories_list') {
                    const categoriesList = Object.entries(db.categories || {}).map(([id, data]) => {
                        return `**${data.name}** (\`${id}\`): ${data.closed ? '🔴 مغلق' : '🟢 مفتوح'} | فئة: \`${data.categoryId || 'غير محددة'}\``;
                    }).join('\n') || 'لا توجد أقسام مضافة.';

                    const embed = new EmbedBuilder().setTitle('📋 قائمة الأقسام').setDescription(categoriesList).setColor(0x5865F2);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('admin_categories_manage').setLabel('رجوع').setEmoji('⬅️').setStyle(ButtonStyle.Danger)
                    );
                    return interaction.update({ embeds: [embed], components: [row] });

                } else if (interaction.customId === 'admin_categories_add_modal') {
                    // ✅ showModal يجب أن يكون أول وآخر رد - لا يوجد أي await قبله
                    const modal = new ModalBuilder().setCustomId('admin_modal_add_category').setTitle('إضافة قسم جديد');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_id').setLabel("معرف القسم (ticket_support)").setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_name').setLabel("اسم القسم").setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_parent').setLabel("معرف فئة القنوات (Category ID)").setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return interaction.showModal(modal);

                } else if (interaction.customId === 'admin_categories_edit_modal') {
                    const modal = new ModalBuilder().setCustomId('admin_modal_edit_category').setTitle('تعديل بيانات قسم');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_id').setLabel("المعرف الحالي للقسم").setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_name').setLabel("الاسم الجديد (اختياري)").setStyle(TextInputStyle.Short).setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_parent').setLabel("معرف الفئة الجديد (اختياري)").setStyle(TextInputStyle.Short).setRequired(false))
                    );
                    return interaction.showModal(modal);

                } else if (interaction.customId === 'admin_categories_delete_modal') {
                    const modal = new ModalBuilder().setCustomId('admin_modal_delete_category').setTitle('حذف قسم');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_id').setLabel("أدخل معرف القسم المراد حذفه").setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return interaction.showModal(modal);

                } else if (interaction.customId === 'admin_categories_toggle_modal') {
                    const modal = new ModalBuilder().setCustomId('admin_modal_toggle_category').setTitle('فتح أو إغلاق قسم');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_id').setLabel("أدخل معرف القسم").setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return interaction.showModal(modal);

                // --- الإدارة العليا ---
                } else if (interaction.customId === 'admin_high_admin_manage') {
                    const highAdminList = (config.highAdminRoleIds || []).map(id => `<@&${id}>`).join(', ') || 'لا يوجد';
                    const embed = new EmbedBuilder()
                        .setTitle('🛡️ إدارة الإدارة العليا')
                        .setDescription('الرتب الحالية: ' + highAdminList)
                        .setColor(0x2B2D31);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('admin_high_admin_add_modal').setLabel('إضافة رتبة').setEmoji('➕').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('admin_high_admin_remove_modal').setLabel('إزالة رتبة').setEmoji('➖').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('admin_panel_back').setLabel('رجوع').setEmoji('⬅️').setStyle(ButtonStyle.Danger)
                    );
                    return interaction.update({ embeds: [embed], components: [row] });

                } else if (interaction.customId === 'admin_high_admin_add_modal') {
                    const modal = new ModalBuilder().setCustomId('admin_modal_add_high_admin').setTitle('إضافة رتبة للإدارة العليا');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel("أدخل معرف الرتبة (Role ID)").setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return interaction.showModal(modal);

                } else if (interaction.customId === 'admin_high_admin_remove_modal') {
                    const modal = new ModalBuilder().setCustomId('admin_modal_remove_high_admin').setTitle('إزالة رتبة من الإدارة العليا');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel("أدخل معرف الرتبة (Role ID)").setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return interaction.showModal(modal);

                // --- أيقونات الرتب ---
                } else if (interaction.customId === 'admin_role_icons_manage') {
                    const icons = config.roleIcons || {};
                    let iconsList = "✨ **قائمة أيقونات الرتب:**\n";
                    if (Object.keys(icons).length === 0) iconsList += "لا توجد أيقونات محددة.";
                    else for (const [rid, icon] of Object.entries(icons)) iconsList += `<@&${rid}>: ${icon}\n`;

                    const embed = new EmbedBuilder().setTitle('✨ إدارة أيقونات الرتب').setDescription(iconsList).setColor(0x57F287);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('admin_role_icon_add_modal').setLabel('تعيين أيقونة').setEmoji('🏷️').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('admin_role_icon_remove_modal').setLabel('إزالة أيقونة').setEmoji('🚫').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('admin_panel_back').setLabel('رجوع').setEmoji('⬅️').setStyle(ButtonStyle.Danger)
                    );
                    return interaction.update({ embeds: [embed], components: [row] });

                } else if (interaction.customId === 'admin_role_icon_add_modal') {
                    const modal = new ModalBuilder().setCustomId('admin_modal_add_role_icon').setTitle('تعيين أيقونة لرتبة');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel("معرف الرتبة (Role ID)").setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('icon').setLabel("الأيقونة (Emoji)").setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return interaction.showModal(modal);

                } else if (interaction.customId === 'admin_role_icon_remove_modal') {
                    const modal = new ModalBuilder().setCustomId('admin_modal_remove_role_icon').setTitle('إزالة أيقونة رتبة');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel("معرف الرتبة (Role ID)").setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return interaction.showModal(modal);

                // --- إعدادات القنوات ---
                } else if (interaction.customId === 'admin_config_manage') {
                    const embed = new EmbedBuilder().setTitle('⚙️ إعدادات القنوات').setDescription('الإعدادات الحالية:').addFields(
                        { name: 'Ticket Category', value: config.ticketCategoryId ? `<#${config.ticketCategoryId}>` : 'غير محدد', inline: true },
                        { name: 'Log Channel', value: config.logChannelId ? `<#${config.logChannelId}>` : 'غير محدد', inline: true },
                        { name: 'Admin Channel', value: config.adminChannelId ? `<#${config.adminChannelId}>` : 'غير محدد', inline: true }
                    ).setColor(0x2B2D31);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('admin_config_edit_channels').setLabel('تعديل القنوات').setEmoji('📺').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('admin_panel_back').setLabel('رجوع').setEmoji('⬅️').setStyle(ButtonStyle.Danger)
                    );
                    return interaction.update({ embeds: [embed], components: [row] });

                } else if (interaction.customId === 'admin_config_edit_channels') {
                    const modal = new ModalBuilder().setCustomId('admin_modal_edit_config').setTitle('تعديل قنوات النظام');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('log_id').setLabel("معرف قناة السجلات (Log)").setStyle(TextInputStyle.Short).setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('admin_id').setLabel("معرف قناة الإدارة (Admin)").setStyle(TextInputStyle.Short).setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stats_id').setLabel("معرف قناة الإحصائيات (Stats)").setStyle(TextInputStyle.Short).setRequired(false))
                    );
                    return interaction.showModal(modal);

                // --- الرجوع والإحصائيات ---
                } else if (interaction.customId === 'admin_panel_back' || interaction.customId === 'admin_refresh_panel') {
                    const embed = new EmbedBuilder()
                        .setTitle('🛠️ لوحة تحكم الإدارة الشاملة')
                        .setDescription('مرحباً بك في مركز التحكم. يمكنك الآن إدارة كل شيء بضغطة زر:')
                        .setColor(0x2B2D31)
                        .setTimestamp();
                    const row1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('admin_categories_manage').setLabel('إدارة الأقسام').setEmoji('📂').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('admin_high_admin_manage').setLabel('الإدارة العليا').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('admin_role_icons_manage').setLabel('أيقونات الرتب').setEmoji('✨').setStyle(ButtonStyle.Success)
                    );
                    const row2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('admin_config_manage').setLabel('إعدادات القنوات').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('admin_stats_view').setLabel('الإحصائيات').setEmoji('📊').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('admin_refresh_panel').setLabel('تحديث').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
                    );
                    return interaction.update({ embeds: [embed], components: [row1, row2] });

                } else if (interaction.customId === 'admin_stats_view') {
                    const ratings = db.ratings || {};
                    let statsText = "📊 **إحصائيات الموظفين:**\n";
                    if (Object.keys(ratings).length === 0) statsText += "لا توجد بيانات تقييم حالياً.";
                    else for (const [staffId, data] of Object.entries(ratings)) {
                        statsText += `\n<@${staffId}>: التذاكر: ${data.acceptedTickets || 0}, النقاط: ${data.score || 0}`;
                    }
                    const embed = new EmbedBuilder().setTitle('📊 إحصائيات النظام').setDescription(statsText).setColor(0x57F287);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('admin_panel_back').setLabel('رجوع').setEmoji('⬅️').setStyle(ButtonStyle.Danger)
                    );
                    return interaction.update({ embeds: [embed], components: [row] });
                }
            }

        // ========================
        // القوائم المنسدلة (Select Menus)
        // ========================
        } else if (interaction.isStringSelectMenu()) {
            try {
                if (interaction.customId === 'ticket_select') {
                    const selectedValue = interaction.values[0];
                    const dept = categories[selectedValue];

                    // ✅ كل الفحوصات sync قبل showModal
                    if (!dept) {
                        return interaction.reply({ content: '❌ هذا القسم لم يعد متاحاً.', flags: MessageFlags.Ephemeral });
                    }

                    const blockData = db.blocks[interaction.user.id];
                    if (blockData) {
                        if (blockData.expires === 'permanent' || blockData.expires > Date.now()) {
                            const expiryMsg = blockData.expires === 'permanent' ? 'دائم' : `<t:${Math.floor(blockData.expires / 1000)}:R>`;
                            return interaction.reply({
                                content: `🚫 أنت محظور من استخدام نظام التذاكر\n**المدة:** ${expiryMsg}\n**السبب:** ${blockData.reason}`,
                                flags: MessageFlags.Ephemeral
                            });
                        } else {
                            delete db.blocks[interaction.user.id];
                            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                        }
                    }

                    if (dept.closed) {
                        return interaction.reply({ content: `❌ عذراً، قسم **${dept.name}** مغلق حالياً.`, flags: MessageFlags.Ephemeral });
                    }

                    if (db.openTickets[interaction.user.id]) {
                        return interaction.reply({ content: '⚠️ لديك تذكرة مفتوحة بالفعل!', flags: MessageFlags.Ephemeral });
                    }

                    // ✅ showModal مباشرة بدون أي await قبله
                    const modal = new ModalBuilder()
                        .setCustomId(`ticket_modal_${selectedValue}`)
                        .setTitle(`فتح تذكرة - ${dept.name}`);
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('problem_description')
                                .setLabel("يرجى شرح مشكلتك بالتفاصيل")
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(true)
                        )
                    );
                    return interaction.showModal(modal);

                } else if (interaction.customId === 'transfer_select') {
                    const selectedValue = interaction.values[0];
                    const dept = categories[selectedValue];

                    if (!dept) {
                        return interaction.reply({ content: '❌ هذا القسم غير متاح.', flags: MessageFlags.Ephemeral });
                    }

                    const ownerId = Object.keys(db.openTickets).find(id => db.openTickets[id].channelId === interaction.channel.id);
                    if (!ownerId) return;

                    // ✅ deferUpdate أول شيء قبل العمليات الثقيلة
                    await interaction.deferUpdate();

                    try {
                        const newCaptcha = generateCaptcha();
                        const attachment = new AttachmentBuilder(newCaptcha.buffer, { name: 'new_captcha.png' });

                        if (dept.categoryId) await interaction.channel.setParent(dept.categoryId, { lockPermissions: false });

                        db.openTickets[ownerId].department = dept.name;
                        db.openTickets[ownerId].verified = false;
                        db.openTickets[ownerId].captchaCode = newCaptcha.code;
                        db.openTickets[ownerId].claimedBy = null;
                        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

                        await interaction.editReply({
                            embeds: [new EmbedBuilder().setColor(0x3498DB).setDescription(`✅ تم نقل التذكرة إلى قسم: **${dept.name}**`)],
                            components: [],
                            files: [attachment]
                        });

                        const adminRoleIds = config.adminRoleIds || [];
                        await interaction.channel.send({
                            content: adminRoleIds.map(id => `<@&${id}>`).join(' '),
                            embeds: [new EmbedBuilder().setColor(0x3498DB).setImage('attachment://new_captcha.png')],
                            files: [attachment]
                        });
                    } catch (err) {
                        console.error('خطأ في نقل التذكرة:', err);
                    }

                } else if (interaction.customId === 'rating_select') {
                    // ✅ deferUpdate أول شيء
                    await interaction.deferUpdate();

                    const [ratingValue, staffId, ticketId] = interaction.values[0].split('_');

                    if (!db.ratings[staffId]) {
                        db.ratings[staffId] = { score: 0, acceptedTickets: 0, details: { excellent: 0, verygood: 0, good: 0, neutral: 0, bad: 0 } };
                    }

                    db.ratings[staffId].details[ratingValue] = (db.ratings[staffId].details[ratingValue] || 0) + 1;

                    const scores = { 'excellent': 5, 'verygood': 4, 'good': 3, 'neutral': 2, 'bad': 1 };
                    db.ratings[staffId].score += scores[ratingValue] || 0;

                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

                    await interaction.editReply({ content: '✅ شكراً لك على تقييمك!', components: [] });
                }
            } catch (e) {
                console.error('خطأ في معالجة القائمة المنسدلة:', e);
            }

        // ========================
        // نماذج Modal
        // ========================
        } else if (interaction.isModalSubmit()) {

            // --- نماذج الإدارة ---
            if (interaction.customId === 'admin_modal_add_category') {
                const id = interaction.fields.getTextInputValue('cat_id');
                const name = interaction.fields.getTextInputValue('cat_name');
                const categoryId = interaction.fields.getTextInputValue('cat_parent');
                db.categories[id] = { name, categoryId, closed: false };
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                return interaction.reply({ content: `✅ تم إضافة القسم **${name}** بنجاح.`, flags: MessageFlags.Ephemeral });

            } else if (interaction.customId === 'admin_modal_edit_category') {
                const id = interaction.fields.getTextInputValue('cat_id');
                if (!db.categories[id]) return interaction.reply({ content: '❌ القسم غير موجود.', flags: MessageFlags.Ephemeral });
                const name = interaction.fields.getTextInputValue('cat_name');
                const catParent = interaction.fields.getTextInputValue('cat_parent');
                if (name) db.categories[id].name = name;
                if (catParent) db.categories[id].categoryId = catParent;
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                return interaction.reply({ content: `✅ تم تحديث القسم بنجاح.`, flags: MessageFlags.Ephemeral });

            } else if (interaction.customId === 'admin_modal_delete_category') {
                const id = interaction.fields.getTextInputValue('cat_id');
                if (!db.categories[id]) return interaction.reply({ content: '❌ القسم غير موجود.', flags: MessageFlags.Ephemeral });
                delete db.categories[id];
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                return interaction.reply({ content: `✅ تم حذف القسم بنجاح.`, flags: MessageFlags.Ephemeral });

            } else if (interaction.customId === 'admin_modal_toggle_category') {
                const id = interaction.fields.getTextInputValue('cat_id');
                if (!db.categories[id]) return interaction.reply({ content: '❌ القسم غير موجود.', flags: MessageFlags.Ephemeral });
                db.categories[id].closed = !db.categories[id].closed;
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                return interaction.reply({ content: `✅ تم ${db.categories[id].closed ? 'إغلاق' : 'فتح'} القسم بنجاح.`, flags: MessageFlags.Ephemeral });

            } else if (interaction.customId === 'admin_modal_add_high_admin') {
                const rid = interaction.fields.getTextInputValue('role_id');
                if (!config.highAdminRoleIds) config.highAdminRoleIds = [];
                if (!config.highAdminRoleIds.includes(rid)) {
                    config.highAdminRoleIds.push(rid);
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                    return interaction.reply({ content: '✅ تم إضافة الرتبة للإدارة العليا.', flags: MessageFlags.Ephemeral });
                }
                return interaction.reply({ content: '⚠️ الرتبة موجودة بالفعل.', flags: MessageFlags.Ephemeral });

            } else if (interaction.customId === 'admin_modal_remove_high_admin') {
                const rid = interaction.fields.getTextInputValue('role_id');
                config.highAdminRoleIds = (config.highAdminRoleIds || []).filter(id => id !== rid);
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                return interaction.reply({ content: '✅ تم إزالة الرتبة من الإدارة العليا.', flags: MessageFlags.Ephemeral });

            } else if (interaction.customId === 'admin_modal_add_role_icon') {
                const rid = interaction.fields.getTextInputValue('role_id');
                const icon = interaction.fields.getTextInputValue('icon');
                if (!config.roleIcons) config.roleIcons = {};
                config.roleIcons[rid] = icon;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                return interaction.reply({ content: '✅ تم تعيين الأيقونة بنجاح.', flags: MessageFlags.Ephemeral });

            } else if (interaction.customId === 'admin_modal_remove_role_icon') {
                const rid = interaction.fields.getTextInputValue('role_id');
                if (config.roleIcons && config.roleIcons[rid]) {
                    delete config.roleIcons[rid];
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                    return interaction.reply({ content: '✅ تم إزالة الأيقونة بنجاح.', flags: MessageFlags.Ephemeral });
                }
                return interaction.reply({ content: '⚠️ لا توجد أيقونة لهذه الرتبة.', flags: MessageFlags.Ephemeral });

            } else if (interaction.customId === 'admin_modal_edit_config') {
                const logId = interaction.fields.getTextInputValue('log_id');
                const adminId = interaction.fields.getTextInputValue('admin_id');
                const statsId = interaction.fields.getTextInputValue('stats_id');
                if (logId) config.logChannelId = logId;
                if (adminId) config.adminChannelId = adminId;
                if (statsId) config.statsChannelId = statsId;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                return interaction.reply({ content: `✅ تم تحديث القنوات بنجاح.`, flags: MessageFlags.Ephemeral });
            }

            // --- فتح التذاكر ---
            if (interaction.customId.startsWith('ticket_modal_')) {
                // ✅ deferReply أول شيء فوراً قبل أي عملية ثقيلة
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const deptKey = interaction.customId.replace('ticket_modal_', '');
                const dept = categories[deptKey];

                if (!dept) {
                    return interaction.editReply({ content: '❌ حدث خطأ، القسم غير موجود.' });
                }

                const problemDescription = interaction.fields.getTextInputValue('problem_description');

                try {
                    const ticketId = ++db.ticketCounter;
                    const captcha = generateCaptcha();
                    const attachment = new AttachmentBuilder(captcha.buffer, { name: 'captcha.png' });
                    const guild = interaction.guild || client.guilds.cache.get(config.guildId);
                    const parentId = dept.categoryId || config.ticketCategoryId;
                    const adminRoleIds = config.adminRoleIds || [];

                    const channel = await guild.channels.create({
                        name: `ticket-${ticketId}`,
                        type: ChannelType.GuildText,
                        parent: parentId,
                        permissionOverwrites: [
                            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                            ...adminRoleIds.map(roleId => ({
                                id: roleId,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
                            })),
                            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                        ]
                    });

                    db.openTickets[interaction.user.id] = {
                        channelId: channel.id,
                        department: dept.name,
                        verified: false,
                        captchaCode: captcha.code,
                        createdAt: Date.now()
                    };
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

                    const ticketEmbed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle(`تذكرة جديدة - ${dept.name}`)
                        .setDescription(`مرحباً ${interaction.user}، يرجى كتابة رمز التحقق لتأكيد تذكرتك.`)
                        .addFields({ name: 'وصف المشكلة', value: problemDescription })
                        .setImage('attachment://captcha.png')
                        .setFooter({ text: `تذكرة رقم: ${ticketId}` });

                    await channel.send({
                        content: `${interaction.user} | ` + adminRoleIds.map(id => `<@&${id}>`).join(' '),
                        embeds: [ticketEmbed],
                        files: [attachment]
                    });

                    await interaction.editReply({ content: `✅ تم فتح تذكرتك بنجاح: ${channel}` });

                } catch (err) {
                    console.error('خطأ في فتح التذكرة:', err);
                    await interaction.editReply({ content: '❌ حدث خطأ أثناء فتح التذكرة.' });
                }
            }
        }
    }
};
