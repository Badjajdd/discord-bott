const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// تسجيل الخط (تأكد اسم الملف مطابق تماماً)
GlobalFonts.registerFromPath(
    path.join(__dirname, 'fonts', 'ARIAL.TTF'),
    'Arial'
);

function generateCaptcha() {
    const width = 200;
    const height = 80;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // خلفية
    ctx.fillStyle = '#2c2f33';
    ctx.fillRect(0, 0, width, height);

    // توليد كود من 4 أرقام
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    // Noise خطوط
    for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.4})`;
        ctx.lineWidth = Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(
            Math.random() * width,
            Math.random() * height
        );
        ctx.lineTo(
            Math.random() * width,
            Math.random() * height
        );
        ctx.stroke();
    }

    // Noise نقاط
    for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.arc(
            Math.random() * width,
            Math.random() * height,
            Math.random() * 2,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    // إعداد النص
    ctx.font = 'bold 40px Arial';
    ctx.fillStyle = '#eaff00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // رسم كل رقم مع تدوير
    for (let i = 0; i < code.length; i++) {

        const x = 30 + i * 40;
        const y = height / 2;

        ctx.save();

        ctx.translate(x, y);

        // تدوير عشوائي
        const rotation = (Math.random() - 0.5) * 0.5;
        ctx.rotate(rotation);

        // رسم الرقم
        ctx.fillText(code[i], 0, 0);

        ctx.restore();
    }

    return {
        buffer: canvas.toBuffer('image/png'),
        code: code
    };
}

module.exports = {
    generateCaptcha
};
