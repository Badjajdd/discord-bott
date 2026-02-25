const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { generateCaptcha } = require('../utils/captcha');
const transcript = require('discord-html-transcripts');
const fs = require('node:fs');
const path = require('node:path');
const ms = require('ms');

const ticketCloseTimers = new Map();

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot) return;

        const configPath = path.join(__dirname, '..', '..', 'config.json');
        let config;
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
            console.error('Failed to read config.json:', e);
            return;
        }

        const { adminRoleIds, logChannelId, statsChannelId, adminChannelId, highAdminRoleIds, roleIcons } = config;

        const dbPath = path.join(__dirname, '..', '..', 'database.json');
        let db;
        try {
            const data = fs.readFileSync(dbPath, 'utf8');
            db = data ? JSON.parse(data) : { openTickets: {}, ticketCounter: 0, ratings: {}, blocks: {}, categories: {} };
        } catch (e) {
            db = { openTickets: {}, ticketCounter: 0, ratings: {}, blocks: {}, categories: {} };
        }

        const categories = db.categories || {};

        const sendLog = async (embed, files = []) => {
            const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
            if (logChannel) await logChannel.send({ embeds: [embed], files: files });
        };

        const getMemberIcon = (member) => {
            if (!roleIcons) return "";
            const memberRoleIds = Array.from(member.roles.cache.keys());
            for (const roleId in roleIcons) {
                if (memberRoleIds.includes(roleId)) {
                    const icon = roleIcons[roleId].trim();
                    return icon + " ";
                }
            }
            return "";
        };

        // --- معالجة رسائل الخاص ---
        if (!message.guild) {
            const ticket = db.openTickets[message.author.id];
            
            if (message.content.toLowerCase() === '-report') {
                const options = Object.entries(categories).map(([id, data]) => ({
                    label: data.name,
                    value: id
                }));

                if (options.length === 0) {
                    return message.channel.send('لا توجد أقسام متاحة حالياً لفتح بلاغ.');
                }

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('report_select')
                    .setPlaceholder('اختر القسم المطلوب لفتح البلاغ')
                    .addOptions(options);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                return message.channel.send({ content: 'يرجى اختيار القسم المناسب لبلاغك:', components: [row] });
            }

            if (!ticket) return;

            if (message.content.toLowerCase() === '-er') {
                const staffId = ticket.claimedBy;
                const ticketId = ticket.ticketId;
                await message.channel.send('تم إغلاق تذكرتك بنجاح.');
                
                const chan = await client.channels.fetch(ticket.channelId).catch(() => null);
                if (chan) {
                    const attachment = await transcript.createTranscript(chan, {
                        limit: -1,
                        fileName: `transcript-${ticketId}.html`,
                        returnType: 'attachment',
                        poweredBy: false
                    });

                    const logEmbed = new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle('تم إغلاق تذكرة (عبر الخاص)')
                        .addFields(
                            { name: 'رقم التذكرة', value: `#${ticketId}`, inline: true },
                            { name: 'صاحب التذكرة', value: `${message.author}`, inline: true }
                        )
                        .setTimestamp();
                    
                    await sendLog(logEmbed, [attachment]);
                    await chan.delete().catch(() => {});
                }

                if (staffId) {
                    const ratingMenu = new StringSelectMenuBuilder()
                        .setCustomId('rating_select')
                        .setPlaceholder('كيف كانت تجربتك؟')
                        .addOptions([
                            { label: 'ممتاز', value: `excellent_${staffId}_${ticketId}` },
                            { label: 'جيد جدا', value: `verygood_${staffId}_${ticketId}` },
                            { label: 'جيد', value: `good_${staffId}_${ticketId}` },
                            { label: 'ليس جيد وليس سيئ', value: `neutral_${staffId}_${ticketId}` },
                            { label: 'سيئ', value: `bad_${staffId}_${ticketId}` }
                        ]);
                    const row = new ActionRowBuilder().addComponents(ratingMenu);
                    await message.author.send({ content: `لقد تم إغلاق التذكرة رقم "${ticketId}". يرجى تقييم الخدمة:`, components: [row] }).catch(() => {});
                } else {
                    await message.author.send({ content: `لقد تم إغلاق التذكرة رقم "${ticketId}".` }).catch(() => {});
                }
                
                delete db.openTickets[message.author.id];
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                return;
            }

            const chan = await client.channels.fetch(ticket.channelId).catch(() => null);
            if (chan) {
                const files = message.attachments.map(a => a.url);
                // صاحب التذكرة ليس لديه أيقونة رتبة (عادي)
                const ownerIcon = config.ticketOwnerIcon ? config.ticketOwnerIcon + ' ' : '';
                await chan.send({ content: `${ownerIcon}**${message.author.username}** : ${message.content || ''}`, files: files });

                // الغاء الاغلاق التلقائي عند رد صاحب التذكرة عبر الخاص
                if (ticketCloseTimers.has(chan.id)) {
                    clearTimeout(ticketCloseTimers.get(chan.id));
                    ticketCloseTimers.delete(chan.id);

                    const cancelEmbed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setDescription('تم إلغاء إغلاق التذكرة التلقائي بسبب رد صاحب التذكرة.');
                    await chan.send({ embeds: [cancelEmbed] });
                    await message.author.send('تم إلغاء إغلاق تذكرتك التلقائي بنجاح. يمكنك الاستمرار في التواصل.').catch(() => {});
                }
            }
            return;
        }

        // --- معالجة الأوامر في السيرفر ---
        const ownerId = Object.keys(db.openTickets).find(id => db.openTickets[id]?.channelId === message.channel.id);
        
        if (message.content.startsWith('-') && (adminRoleIds || []).some(roleId => message.member.roles.cache.has(roleId))) {
            const [cmd, ...args] = message.content.slice(1).trim().split(/ +/);
            const command = cmd.toLowerCase();
            const isHighAdmin = highAdminRoleIds.some(roleId => message.member.roles.cache.has(roleId));

            if (command === 'sfb') {
                if (message.channel.id !== statsChannelId) return;
                const targetUser = message.mentions.users.first() || message.author;
                const stats = db.ratings[targetUser.id] || { score: 0, acceptedTickets: 0, details: { excellent: 0, verygood: 0, good: 0, neutral: 0, bad: 0 } };
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`إحصائيات التقييم - ${targetUser.tag}`)
                    .setThumbnail(targetUser.displayAvatarURL())
                    .addFields(
                        { name: 'اسم العضو', value: `${targetUser}`, inline: true },
                        { name: 'إجمالي التقييم', value: `${stats.score}`, inline: true },
                        { name: 'إجمالي التذاكر المقبولة', value: `${stats.acceptedTickets}`, inline: true },
                        { name: 'إحصائيات التقييمات:', value: `ممتاز: ${stats.details.excellent}\nجيد جدا: ${stats.details.verygood}\nجيد: ${stats.details.good}\nليس جيد وليس سيئ: ${stats.details.neutral}\nسيئ: ${stats.details.bad}` }
                    ).setTimestamp();
                return message.channel.send({ embeds: [embed] });
            }

            // ======= أوامر الإدارة العليا (block / unblock / restpoints) =======
            if (['block', 'unblock', 'restpoints', 'addrole', 'removerole'].includes(command)) {
                if (message.channel.id !== adminChannelId) return;
                if (!isHighAdmin) return;

                // إضافة رتبة أدمن: -addrole @role [admin|highadmin]
                if (command === 'addrole') {
                    const role = message.mentions.roles.first();
                    if (!role) return message.channel.send('يرجى منشن الرتبة المراد إضافتها.');
                    const type = args[1]?.toLowerCase();
                    const configPath2 = path.join(__dirname, '..', '..', 'config.json');
                    const cfg = JSON.parse(fs.readFileSync(configPath2, 'utf8'));
                    if (type === 'highadmin' || type === 'high') {
                        if (!cfg.highAdminRoleIds.includes(role.id)) cfg.highAdminRoleIds.push(role.id);
                        fs.writeFileSync(configPath2, JSON.stringify(cfg, null, 2));
                        return message.channel.send(`✅ تمت إضافة ${role} كرتبة **High Admin**.`);
                    } else {
                        if (!cfg.adminRoleIds.includes(role.id)) cfg.adminRoleIds.push(role.id);
                        fs.writeFileSync(configPath2, JSON.stringify(cfg, null, 2));
                        return message.channel.send(`✅ تمت إضافة ${role} كرتبة **Admin**.`);
                    }
                }

                // إزالة رتبة أدمن: -removerole @role [admin|highadmin]
                if (command === 'removerole') {
                    const role = message.mentions.roles.first();
                    if (!role) return message.channel.send('يرجى منشن الرتبة المراد إزالتها.');
                    const type = args[1]?.toLowerCase();
                    const configPath2 = path.join(__dirname, '..', '..', 'config.json');
                    const cfg = JSON.parse(fs.readFileSync(configPath2, 'utf8'));
                    if (type === 'highadmin' || type === 'high') {
                        cfg.highAdminRoleIds = cfg.highAdminRoleIds.filter(id => id !== role.id);
                        fs.writeFileSync(configPath2, JSON.stringify(cfg, null, 2));
                        return message.channel.send(`✅ تمت إزالة ${role} من رتب **High Admin**.`);
                    } else {
                        cfg.adminRoleIds = cfg.adminRoleIds.filter(id => id !== role.id);
                        fs.writeFileSync(configPath2, JSON.stringify(cfg, null, 2));
                        return message.channel.send(`✅ تمت إزالة ${role} من رتب **Admin**.`);
                    }
                }

                // جلب المستخدم المستهدف: منشن أو ID مباشر
                let targetUser = message.mentions.users.first();
                if (!targetUser && args[0] && /^\d{17,20}$/.test(args[0])) {
                    targetUser = await client.users.fetch(args[0]).catch(() => null);
                }
                if (!targetUser) return message.channel.send('يرجى منشن العضو أو كتابة الـ ID الخاص به.');

                if (command === 'restpoints') {
                    const reason = args.slice(1).join(' ') || 'لا يوجد سبب';
                    db.ratings[targetUser.id] = { score: 0, acceptedTickets: 0, details: { excellent: 0, verygood: 0, good: 0, neutral: 0, bad: 0 } };
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                    const logEmbed = new EmbedBuilder().setColor(0xED4245).setTitle('تصفير نقاط').addFields({ name: 'المشرف', value: `${message.author.tag}`, inline: true }, { name: 'العضو', value: `${targetUser.tag}`, inline: true }, { name: 'السبب', value: reason, inline: false }).setTimestamp();
                    await sendLog(logEmbed);
                    return message.channel.send(`تم تصفير نقاط ${targetUser} بنجاح.`);
                }

                if (command === 'block') {
                    // تحديد ما إذا كانت args[0] هو ID أو منشن
                    // إذا args[0] هو ID أو منشن فالمدة ستكون في args[1]، وإلا في args[0]
                    let durationArgIndex = message.mentions.users.first() ? 1 : 2; // بعد تخطي معرف المستخدم
                    // تبسيط: targetUser تم جلبه بالفعل، نحسب بقية الـ args بعد المعرف
                    const remainingArgs = message.mentions.users.first()
                        ? args.slice(1)   // منشن: args[0] = mention, args[1] = duration
                        : args.slice(1);  // ID:   args[0] = id,      args[1] = duration

                    let durationStr = remainingArgs[0];
                    let reason = remainingArgs.slice(1).join(' ') || 'لا يوجد سبب';
                    let expires = 'permanent';

                    if (durationStr && /^\d+[mhdw]$/.test(durationStr)) {
                        const msTime = ms(durationStr);
                        if (msTime) expires = Date.now() + msTime;
                    } else if (durationStr) {
                        reason = remainingArgs.join(' ') || 'لا يوجد سبب';
                    }

                    db.blocks[targetUser.id] = { expires, reason, by: message.author.id };
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                    const expiryMsg = expires === 'permanent' ? 'دائم' : durationStr;
                    const logEmbed = new EmbedBuilder().setColor(0xED4245).setTitle('حظر من التذاكر').addFields(
                        { name: 'المشرف', value: `${message.author.tag}`, inline: true },
                        { name: 'المحظور', value: `${targetUser.tag}`, inline: true },
                        { name: 'المدة', value: expiryMsg, inline: true },
                        { name: 'السبب', value: reason, inline: false }
                    ).setTimestamp();
                    await sendLog(logEmbed);
                    return message.channel.send(`تم حظر ${targetUser} من نظام التذاكر بنجاح. المدة: ${expiryMsg}`);
                }

                if (command === 'unblock') {
                    if (db.blocks[targetUser.id]) {
                        delete db.blocks[targetUser.id];
                        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                        return message.channel.send(`تم فك حظر ${targetUser} بنجاح.`);
                    } else return message.channel.send('هذا العضو غير محظور.');
                }
            }
        }

        if (!ownerId) return;
        const ticket = db.openTickets[ownerId];
        const user = await client.users.fetch(ownerId).catch(() => null);
        const isHighAdmin = highAdminRoleIds.some(roleId => message.member.roles.cache.has(roleId));

        // ملاحظة: إلغاء الإغلاق التلقائي يتم الآن في قسم الخاص أعلاه
        // لأن صاحب التذكرة يتواصل فقط عبر الخاص وليس عبر الروم

        if (!ticket.verified && (adminRoleIds || []).some(roleId => message.member.roles.cache.has(roleId))) {
            if (message.content.trim() === ticket.captchaCode) {
                ticket.verified = true;
                ticket.claimedBy = message.author.id;
                if (!db.ratings[message.author.id]) {
                    db.ratings[message.author.id] = { score: 0, acceptedTickets: 0, details: { excellent: 0, verygood: 0, good: 0, neutral: 0, bad: 0 } };
                }
                db.ratings[message.author.id].acceptedTickets++;
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                
                const claimEmbed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setDescription(`تم استلام التذكرة من قبل ${message.author}`);
                await message.channel.send({ embeds: [claimEmbed] });
                if (user) await user.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`تم استلام التذكرة الخاصة بك من قبل **${message.member.displayName}**`)] }).catch(() => {});
                try { await message.delete(); } catch(e) {}
                return;
            }
        }

        if (message.content.startsWith('-') && (adminRoleIds || []).some(roleId => message.member.roles.cache.has(roleId))) {
            const [cmd, ...args] = message.content.slice(1).trim().split(/ +/);
            const command = cmd.toLowerCase();

            if (['a', 'fdr', 'dr', 'fr', 'r', 'cr', 'er', 'tra', 'name'].includes(command)) {

                // ======= التحقق من الصلاحية: فقط المستلم يستطيع استخدام الأوامر =======
                // استثناءات: -a (highAdmin فقط), -fdr (highAdmin فقط), -fr (highAdmin فقط), -er (الجميع)
                const claimedCommands = ['r', 'cr', 'dr', 'tra', 'name'];
                const isClaimedCommand = claimedCommands.includes(command);

                if (isClaimedCommand) {
                    // يجب أن يكون المستلم الحالي هو من يستخدم الأمر
                    if (!ticket.verified || ticket.claimedBy !== message.author.id) {
                        return message.channel.send({ content: 'انت غير مستلم لهذه التذكرة' })
                            .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
                    }
                }
                // -er: يستطيع أي مشرف إغلاق التذكرة (المستلم + الإدارة العليا)
                // -a, -fr, -fdr: محمية بـ isHighAdmin داخلها

                if (command === 'er') {
                    await message.channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('يتم إغلاق التذكرة الآن...')] });
                    const attachment = await transcript.createTranscript(message.channel, { limit: -1, fileName: `transcript-${ticket.ticketId}.html`, returnType: 'attachment', poweredBy: false });
                    const logEmbed = new EmbedBuilder().setColor(0xED4245).setTitle('تم إغلاق تذكرة').addFields({ name: 'رقم التذكرة', value: `#${ticket.ticketId}`, inline: true }, { name: 'صاحب التذكرة', value: `<@${ownerId}>`, inline: true }, { name: 'أغلق بواسطة', value: `${message.author}`, inline: true }).setTimestamp();
                    await sendLog(logEmbed, [attachment]);
                    if (user) {
                        const staffId = ticket.claimedBy;
                        if (staffId) {
                            const ratingMenu = new StringSelectMenuBuilder().setCustomId('rating_select').setPlaceholder('كيف كانت تجربتك؟').addOptions([{ label: 'ممتاز', value: `excellent_${staffId}_${ticket.ticketId}` }, { label: 'جيد جدا', value: `verygood_${staffId}_${ticket.ticketId}` }, { label: 'جيد', value: `good_${staffId}_${ticket.ticketId}` }, { label: 'ليس جيد وليس سيئ', value: `neutral_${staffId}_${ticket.ticketId}` }, { label: 'سيئ', value: `bad_${staffId}_${ticket.ticketId}` }]);
                            const row = new ActionRowBuilder().addComponents(ratingMenu);
                            await user.send({ content: `لقد تم إغلاق التذكرة رقم "${ticket.ticketId}". يرجى تقييم الخدمة:`, components: [row] }).catch(() => {});
                        } else await user.send({ content: `لقد تم إغلاق التذكرة رقم "${ticket.ticketId}".` }).catch(() => {});
                    }
                    delete db.openTickets[ownerId];
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                    setTimeout(() => message.channel.delete().catch(() => {}), 2000);
                    return;
                }

                if (!ticket.verified && command !== 'fdr') {
                    return message.channel.send('يرجى استلام التذكرة أولاً عبر إدخال كود الكابتشا.').then(m => setTimeout(() => m.delete(), 3000));
                }

                if (command === 'a') {
                    if (!isHighAdmin) return message.channel.send('ليس لديك صلاحية لاستخدام هذا الأمر.').then(m => setTimeout(() => m.delete(), 3000));
                    const txt = args.join(' ');
                    if (!txt) return;
                    // لا توجد أيقونة هنا عمداً لإخفاء هوية الرتبة
                    const content = `**High Management** : ${txt}`;
                    await message.channel.send({ content });
                    if (user) await user.send({ content }).catch(() => {});
                    // لا نحذف رسالة الأدمن
                    return;
                }

                if (command === 'fr') {
                    if (!isHighAdmin) return message.channel.send('ليس لديك صلاحية لاستخدام هذا الأمر.').then(m => setTimeout(() => m.delete(), 3000));
                    await message.channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('إغلاق التذكرة إجبارياً...')] });
                    const attachment = await transcript.createTranscript(message.channel, { limit: -1, fileName: `transcript-${ticket.ticketId}.html`, returnType: 'attachment', poweredBy: false });
                    const logEmbed = new EmbedBuilder().setColor(0xED4245).setTitle('تم إغلاق تذكرة (إجباري)').addFields({ name: 'رقم التذكرة', value: `#${ticket.ticketId}`, inline: true }, { name: 'صاحب التذكرة', value: `<@${ownerId}>`, inline: true }, { name: 'أغلق بواسطة', value: `${message.author}`, inline: true }).setTimestamp();
                    await sendLog(logEmbed, [attachment]);
                    if (user) {
                        const staffId = ticket.claimedBy;
                        if (staffId) {
                            const ratingMenu = new StringSelectMenuBuilder().setCustomId('rating_select').setPlaceholder('كيف كانت تجربتك؟').addOptions([{ label: 'ممتاز', value: `excellent_${staffId}_${ticket.ticketId}` }, { label: 'جيد جدا', value: `verygood_${staffId}_${ticket.ticketId}` }, { label: 'جيد', value: `good_${staffId}_${ticket.ticketId}` }, { label: 'ليس جيد وليس سيئ', value: `neutral_${staffId}_${ticket.ticketId}` }, { label: 'سيئ', value: `bad_${staffId}_${ticket.ticketId}` }]);
                            const row = new ActionRowBuilder().addComponents(ratingMenu);
                            await user.send({ content: `لقد تم إغلاق التذكرة رقم "${ticket.ticketId}". يرجى تقييم الخدمة:`, components: [row] }).catch(() => {});
                        } else await user.send({ content: `لقد تم إغلاق التذكرة رقم "${ticket.ticketId}".` }).catch(() => {});
                    }
                    delete db.openTickets[ownerId];
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                    setTimeout(() => message.channel.delete().catch(() => {}), 2000);
                    return;
                }

                if (command === 'fdr' || command === 'dr') {
                    if (command === 'fdr' && !isHighAdmin) return message.channel.send('ليس لديك صلاحية لاستخدام هذا الأمر.').then(m => setTimeout(() => m.delete(), 3000));
                    if (command === 'dr' && (!ticket.verified || ticket.claimedBy !== message.author.id)) return message.channel.send('لا يمكنك ترك تذكرة لم تستلمها بعد أو لست مستلمها.').then(m => setTimeout(() => m.delete(), 3000));
                    const captcha = generateCaptcha();
                    const attachment = new AttachmentBuilder(captcha.buffer, { name: 'new_captcha.png' });
                    if (ticket.claimedBy && db.ratings[ticket.claimedBy]) {
                        db.ratings[ticket.claimedBy].acceptedTickets = Math.max(0, db.ratings[ticket.claimedBy].acceptedTickets - 1);
                    }
                    ticket.verified = false;
                    ticket.claimedBy = null;
                    ticket.captchaCode = captcha.code;
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                    const leaveEmbed = new EmbedBuilder().setColor(0xFEE75C).setTitle('تم ترك استلام التذكرة').setDescription(command === 'fdr' ? `قام ${message.author} بإجبار ترك استلام التذكرة.` : `قام المستلم ${message.author} بترك استلام التذكرة.`).setImage('attachment://new_captcha.png').setTimestamp();
                    await message.channel.send({ embeds: [leaveEmbed], files: [attachment] });
                    const logEmbed = new EmbedBuilder().setColor(0xFEE75C).setTitle('ترك استلام تذكرة').addFields({ name: 'العضو', value: `${message.author.tag}`, inline: true }, { name: 'النوع', value: command === 'fdr' ? 'إجباري' : 'يدوي', inline: true }, { name: 'رقم التذكرة', value: `#${ticket.ticketId}`, inline: true }).setTimestamp();
                    await sendLog(logEmbed);
                    return;
                }

                if (command === 'r') {
                    const txt = args.join(' ');
                    if (!txt && message.attachments.size === 0) return;
                    const iconString = getMemberIcon(message.member);
                    const files = message.attachments.map(a => a.url);
                    // نستخدم Bold بدلاً من ### لتجنب heading، ولا نحذف رسالة الأدمن
                    const formattedContent = `${iconString}**${message.member.displayName}** : ${txt}`;
                    await message.channel.send({ content: formattedContent, files: files });
                    if (user) await user.send({ content: formattedContent, files: files }).catch(() => {});
                    // لا نحذف رسالة الأدمن
                    return;
                }

                if (command === 'cr') {
                    const time = args[0];
                    const closeTicket = async () => {
                        const chan = await client.channels.fetch(message.channel.id).catch(() => null);
                        if (chan) {
                            const attachment = await transcript.createTranscript(chan, { limit: -1, fileName: `transcript-${ticket.ticketId}.html`, returnType: 'attachment', poweredBy: false });
                            const logEmbed = new EmbedBuilder().setColor(0xED4245).setTitle('تم إغلاق تذكرة (تلقائي/مؤقت)').addFields({ name: 'رقم التذكرة', value: `#${ticket.ticketId}`, inline: true }, { name: 'صاحب التذكرة', value: `<@${ownerId}>`, inline: true }, { name: 'أغلق بواسطة', value: `${message.author}`, inline: true }).setTimestamp();
                            await sendLog(logEmbed, [attachment]);
                            await chan.delete().catch(() => {});
                        }
                        const staffId = ticket.claimedBy;
                        if (user) {
                            if (staffId) {
                                const ratingMenu = new StringSelectMenuBuilder().setCustomId('rating_select').setPlaceholder('كيف كانت تجربتك؟').addOptions([{ label: 'ممتاز', value: `excellent_${staffId}_${ticket.ticketId}` }, { label: 'جيد جدا', value: `verygood_${staffId}_${ticket.ticketId}` }, { label: 'جيد', value: `good_${staffId}_${ticket.ticketId}` }, { label: 'ليس جيد وليس سيئ', value: `neutral_${staffId}_${ticket.ticketId}` }, { label: 'سيئ', value: `bad_${staffId}_${ticket.ticketId}` }]);
                                const row = new ActionRowBuilder().addComponents(ratingMenu);
                                await user.send({ content: `لقد تم إغلاق التذكرة رقم "${ticket.ticketId}". يرجى تقييم الخدمة:`, components: [row] }).catch(() => {});
                            } else await user.send({ content: `لقد تم إغلاق التذكرة رقم "${ticket.ticketId}".` }).catch(() => {});
                        }
                        delete db.openTickets[ownerId];
                        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                    };
                    if (!time) {
                        await message.channel.send('سيتم اغلاق التذكرة خلال 5 ثواني');
                        setTimeout(closeTicket, 5000);
                    } else {
                        const msTime = ms(time); if (isNaN(msTime)) return message.channel.send('وقت غير صالح.');
                        await message.channel.send(`سيتم اغلاق التذكرة تلقائي بعد ${time}`);
                        if (user) {
                            await user.send(`تم تحويل تذكرتك لوضع الاهمال في حال عدم الرد سيتم اغلاق تذكرتك بعد (${time})`).catch(() => {});
                        }
                        const timer = setTimeout(closeTicket, msTime);
                        ticketCloseTimers.set(message.channel.id, timer);
                    }
                    return;
                }

                if (command === 'tra') {
                    const options = Object.entries(categories).map(([id, data]) => ({ label: data.name, value: id }));
                    if (options.length === 0) return message.channel.send('لا توجد أقسام متاحة للنقل إليها.');
                    const selectMenu = new StringSelectMenuBuilder().setCustomId('transfer_select').setPlaceholder('اختر القسم الجديد للنقل إليه').addOptions(options);
                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    await message.channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('نقل التذكرة').setDescription('يرجى اختيار القسم الجديد:')], components: [row] });
                    return;
                }

                if (command === 'name') {
                    const newName = args.join('-');
                    if (!newName) return message.channel.send('يرجى كتابة الاسم الجديد بعد الأمر. مثال: `-name ticket-new`');
                    try {
                        const oldName = message.channel.name;
                        await message.channel.setName(newName);
                        await message.channel.send('تم تغير اسم التذكرة الى ' + newName);
                        const logEmbed = new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle('تغيير اسم تذكرة')
                            .addFields(
                                { name: 'المشرف', value: `${message.author.tag}`, inline: true },
                                { name: 'الاسم القديم', value: `\`${oldName}\``, inline: true },
                                { name: 'الاسم الجديد', value: `\`${newName}\``, inline: true },
                                { name: 'رقم التذكرة', value: `#${ticket.ticketId}`, inline: true }
                            )
                            .setTimestamp();
                        await sendLog(logEmbed);
                    } catch (error) {
                        console.error('Error renaming channel:', error);
                        await message.channel.send('حدث خطأ أثناء محاولة تغيير اسم القناة. تأكد من أن البوت لديه الصلاحيات الكافية.');
                    }
                    return;
                }
            }
        }
    },
};
