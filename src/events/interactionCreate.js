const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
