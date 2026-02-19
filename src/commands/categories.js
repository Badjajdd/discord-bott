const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('categories')
        .setDescription('نظام إدارة أقسام التذاكر')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('إضافة قسم جديد للتذاكر')
            .addStringOption(opt => opt.setName('id').setDescription('معرف القسم (مثل ticket_new)').setRequired(true))
            .addStringOption(opt => opt.setName('name').setDescription('اسم القسم').setRequired(true))
            .addStringOption(opt => opt.setName('category_id').setDescription('معرف فئة القنوات (Category ID) في الديسكورد').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('delete')
            .setDescription('حذف قسم من النظام')
            .addStringOption(opt => opt.setName('id').setDescription('معرف القسم المراد حذفه').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('edit')
            .setDescription('تعديل بيانات قسم موجود')
            .addStringOption(opt => opt.setName('current_id').setDescription('المعرف الحالي للقسم').setRequired(true))
            .addStringOption(opt => opt.setName('new_id').setDescription('المعرف الجديد للقسم (اختياري)'))
            .addStringOption(opt => opt.setName('new_name').setDescription('الاسم الجديد للقسم (اختياري)'))
            .addStringOption(opt => opt.setName('new_category_id').setDescription('معرف الفئة الجديد (اختياري)')))
        .addSubcommand(sub => sub
            .setName('reorder')
            .setDescription('تعديل ترتيب الأقسام في لوحة التذاكر')
            .addStringOption(opt => opt.setName('order').setDescription('الترتيب الجديد بالمعرفات مفصولة بفاصلة (مثال: id1,id2,id3)').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('عرض حالة جميع الأقسام (مفتوح / مغلق)'))
        .addSubcommand(sub => sub
            .setName('close')
            .setDescription('إغلاق قسم مؤقتًا')
            .addStringOption(opt => opt.setName('id').setDescription('معرف القسم').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('open')
            .setDescription('إعادة فتح القسم')
            .addStringOption(opt => opt.setName('id').setDescription('معرف القسم').setRequired(true))),

    async execute(interaction) {
        const { adminChannelId } = require('../../config.json');
        if (interaction.channelId !== adminChannelId) {
            return interaction.reply({ content: ' هذا الأمر مسموح به فقط في روم الإدارة المخصص.', ephemeral: true });
        }
        const dbPath = path.join(__dirname, '..', '..', 'database.json');
        
        // التأكد من وجود الملف قبل القراءة
        if (!fs.existsSync(dbPath)) {
            fs.writeFileSync(dbPath, JSON.stringify({ categories: {} }, null, 2));
        }

        let db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (!db.categories) db.categories = {};

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            const id = interaction.options.getString('id');
            const name = interaction.options.getString('name');
            const categoryId = interaction.options.getString('category_id');
            db.categories[id] = { name, categoryId, closed: false };
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            return interaction.reply({ content: ` تم إضافة القسم **${name}** بنجاح.\nالمعرف: \`${id}\`\nفئة القنوات: \`${categoryId}\``, ephemeral: true });
        }

        if (subcommand === 'delete') {
            const id = interaction.options.getString('id');
            if (!db.categories[id]) return interaction.reply({ content: ' هذا القسم غير موجود.', ephemeral: true });
            const name = db.categories[id].name;
            delete db.categories[id];
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            return interaction.reply({ content: ` تم حذف القسم **${name}** (\`${id}\`) نهائياً من النظام.`, ephemeral: true });
        }

        if (subcommand === 'edit') {
            const currentId = interaction.options.getString('current_id');
            const newId = interaction.options.getString('new_id');
            const newName = interaction.options.getString('new_name');
            const newCategoryId = interaction.options.getString('new_category_id');

            if (!db.categories[currentId]) return interaction.reply({ content: ' هذا القسم غير موجود.', ephemeral: true });

            let categoryData = { ...db.categories[currentId] };
            
            if (newName) categoryData.name = newName;
            if (newCategoryId) categoryData.categoryId = newCategoryId;

            if (newId && newId !== currentId) {
                if (db.categories[newId]) return interaction.reply({ content: ' المعرف الجديد مستخدم بالفعل لقسم آخر.', ephemeral: true });
                
                const newCategories = {};
                for (const key in db.categories) {
                    if (key === currentId) {
                        newCategories[newId] = categoryData;
                    } else {
                        newCategories[key] = db.categories[key];
                    }
                }
                db.categories = newCategories;
            } else {
                db.categories[currentId] = categoryData;
            }

            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            return interaction.reply({ content: ` تم تحديث بيانات القسم **${categoryData.name}** بنجاح.`, ephemeral: true });
        }

        if (subcommand === 'reorder') {
            const orderStr = interaction.options.getString('order');
            const newOrder = orderStr.split(',').map(id => id.trim());
            
            const existingIds = Object.keys(db.categories);
            const invalidIds = newOrder.filter(id => !existingIds.includes(id));
            
            if (invalidIds.length > 0) {
                return interaction.reply({ content: ` المعرفات التالية غير موجودة: \`${invalidIds.join(', ')}\``, ephemeral: true });
            }

            if (newOrder.length !== existingIds.length) {
                return interaction.reply({ content: ` يجب تزويد جميع المعرفات الحالية لضمان الترتيب الصحيح. المعرفات المتوفرة هي: \`${existingIds.join(', ')}\``, ephemeral: true });
            }

            const reorderedCategories = {};
            newOrder.forEach(id => {
                reorderedCategories[id] = db.categories[id];
            });

            db.categories = reorderedCategories;
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            return interaction.reply({ content: ` تم تحديث ترتيب الأقسام بنجاح وفقاً لذوقك الرفيع. ✨`, ephemeral: true });
        }

        if (subcommand === 'status') {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📊 حالة أقسام التذاكر')
                .setTimestamp();

            const categoryList = Object.entries(db.categories).map(([id, data]) => {
                return `**${data.name}** (\`${id}\`): ${data.closed ? '🔴 مغلق' : '🟢 مفتوح'} | الفئة: \`${data.categoryId || 'غير محددة'}\``;
            }).join('\n') || 'لا توجد أقسام مسجلة.';

            embed.setDescription(categoryList);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'close') {
            const id = interaction.options.getString('id');
            if (!db.categories[id]) return interaction.reply({ content: ' هذا القسم غير موجود.', ephemeral: true });
            db.categories[id].closed = true;
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            return interaction.reply({ content: `🔴 تم إغلاق القسم **${db.categories[id].name}** بنجاح.`, ephemeral: true });
        }

        if (subcommand === 'open') {
            const id = interaction.options.getString('id');
            if (!db.categories[id]) return interaction.reply({ content: ' هذا القسم غير موجود.', ephemeral: true });
            db.categories[id].closed = false;
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            return interaction.reply({ content: `🟢 تم إعادة فتح القسم **${db.categories[id].name}** بنجاح.`, ephemeral: true });
        }
    }
};
