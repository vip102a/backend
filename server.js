// server.js
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// ================== CONFIG ==================
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ MISSING BOT_TOKEN env var!');
}
const TELEGRAM_API = BOT_TOKEN
  ? `https://api.telegram.org/bot${BOT_TOKEN}`
  : null;

// 👉 URL 2 mini app (có thể chỉnh lại nếu sau này đổi domain)
const LUCKY_URL   = process.env.LUCKY_URL   || 'https://frontend-sigma-plum-47.vercel.app/';
const SHOOTER_URL = process.env.SHOOTER_URL || 'https://shooter-miniapp.vercel.app/';

console.log('LUCKY_URL   =', LUCKY_URL);
console.log('SHOOTER_URL =', SHOOTER_URL);

// 👉 Map lưu Gold đang chờ claim cho từng user Telegram
// key = userId (string), value = số Gold chờ
const pendingGold = new Map();

// ================== HEALTH CHECK ==================
app.get('/', (req, res) => {
  res.send('Telegram Stars backend is running');
});

// ================== CREATE INVOICE (dùng chung cho Lucky & Game Shop) ==================
app.post('/api/create-invoice', async (req, res) => {
  try {
    if (!BOT_TOKEN || !TELEGRAM_API) {
      return res.json({
        ok: false,
        error: 'Server chưa cấu hình BOT_TOKEN (env BOT_TOKEN).'
      });
    }

    const {
      title = 'Lucky Box',
      description = 'Mua 1 Lucky Box để nhận phần thưởng digital',
      price_stars = 50,  // số Stars
      payload
    } = req.body;

    const amount = Number(price_stars) || 0;
    if (amount <= 0) {
      return res.json({ ok: false, error: 'Giá Stars không hợp lệ.' });
    }

    // KHÔNG gửi provider_token với Stars
    const body = {
      title,
      description,
      payload: payload || ('p' + Date.now()),
      currency: 'XTR', // Telegram Stars
      prices: [
        {
          label: title || 'Lucky Box',
          amount: amount // 50 Stars => 50
        }
      ]
    };

    const resp = await fetch(`${TELEGRAM_API}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const j = await resp.json();
    console.log('== createInvoiceLink response ==', j);

    if (!j.ok) {
      return res.json({
        ok: false,
        error: j.description || 'Telegram createInvoiceLink error',
        raw_response: j
      });
    }

    return res.json({
      ok: true,
      invoiceLink: j.result
    });

  } catch (e) {
    console.error('ERROR /api/create-invoice:', e);
    return res.json({ ok: false, error: e.message });
  }
});

// ================== DELIVER REWARD (demo cũ, để nguyên) ==================
app.post('/api/deliver', async (req, res) => {
  try {
    const { payload } = req.body;
    console.log('Deliver reward for payload:', payload);

    const rewardCode =
      'LUCKY-' + Math.random().toString(36).slice(2, 10).toUpperCase();

    return res.json({
      ok: true,
      reward: rewardCode
    });
  } catch (e) {
    console.error('ERROR /api/deliver:', e);
    return res.json({ ok: false, error: e.message });
  }
});

// ================== API CLAIM GOLD CHO GAME SURVIVAL ==================
app.post('/api/claim-gold', (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.json({ ok: false, error: 'Missing userId' });
    }
    const key = String(userId);
    const amount = pendingGold.get(key) || 0;

    if (amount > 0) {
      pendingGold.delete(key);
    }

    console.log(`User ${key} claim gold = ${amount}`);
    return res.json({ ok: true, bonusGold: amount });
  } catch (e) {
    console.error('ERROR /api/claim-gold:', e);
    return res.json({ ok: false, error: e.message });
  }
});

// ================== WEBHOOK ==================
app.post('/webhook', async (req, res) => {
  try {
    const upd = req.body;
    console.log('== WEBHOOK RECEIVED ==', JSON.stringify(upd, null, 2));

    // Trả 200 ngay cho Telegram
    res.sendStatus(200);

    if (!BOT_TOKEN || !TELEGRAM_API) return;

    // 1) Pre-checkout: BẮT BUỘC phải trả lời
    if (upd.pre_checkout_query) {
      const id = upd.pre_checkout_query.id;

      await fetch(`${TELEGRAM_API}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: id,
          ok: true
          // Nếu muốn từ chối: ok:false, error_message:'Hết hàng...'
        })
      });

      console.log('>> PRE CHECKOUT ACCEPTED:', id);
      return;
    }

    // 2) Payment thành công (Telegram gửi successful_payment)
    if (upd.message && upd.message.successful_payment) {
      const payment = upd.message.successful_payment;
      const chatId = upd.message.chat.id;
      const fromUser = upd.message.from;
      const fromId = fromUser && fromUser.id;
      const payload = payment.invoice_payload || '';
      const totalStars = payment.total_amount || 0;

      console.log('>> PAYMENT SUCCESS (via webhook): payload =', payload, 'totalStars =', totalStars);

      // Nếu payload bắt đầu bằng "gold-pack-" => đây là mua Gold trong shop của game
      // Game đã tự cộng Gold bằng openInvoice callback → ở webhook chỉ nhắn thông báo nhẹ.
      if (payload.startsWith('gold-pack-')) {
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: 'Thanh toán Stars cho gói Gold trong Survival Shooter thành công. Gold đã được cộng trực tiếp trong game.'
          })
        });
        return;
      }

      // Còn lại: coi như đây là lượt quay Lucky Box
      // 1 sao = 10 Gold, Lucky Box = 50⭐ (500 Gold "giá trị") nhưng thưởng random:
      // 20%: 0 Gold
      // 50%: 300 Gold
      // 20%: 500 Gold
      // 10%: 1000 Gold
      let bonusGold = 0;
      const r = Math.random();
      if (r < 0.20) {
        bonusGold = 0;
      } else if (r < 0.70) {
        bonusGold = 300;
      } else if (r < 0.90) {
        bonusGold = 500;
      } else {
        bonusGold = 1000;
      }

      let msgText = '';
      if (bonusGold > 0 && fromId) {
        const key = String(fromId);
        const old = pendingGold.get(key) || 0;
        const now = old + bonusGold;
        pendingGold.set(key, now);

        msgText =
          '🎁 Kết quả Lucky Box:\n' +
          `• Bạn nhận được +${bonusGold} Gold để dùng trong game Survival Shooter.\n` +
          `• Tổng Gold đang chờ trong game: ${now}.\n\n` +
          'Hãy mở mini app 🔫 Survival Shooter để nhận Gold vào tài khoản game.';
      } else {
        msgText =
          '🎁 Kết quả Lucky Box:\n' +
          'Chúc bạn may mắn lần sau! Lần này bạn không nhận được Gold nào.';
      }

      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msgText
        })
      });

      return;
    }

    // 3) Xử lý /start -> gửi menu 2 mini app
    if (upd.message && upd.message.text) {
      const chatId = upd.message.chat.id;
      const text = (upd.message.text || '').trim();

      if (text === '/start' || text.toLowerCase() === 'start') {
        const menuText =
          'Chào bạn! Hãy chọn mini app muốn mở:\n\n' +
          '🎁 Lucky Box – Mở hộp quà nhận Gold dùng cho game.\n' +
          '🔫 Survival Shooter – Game bắn súng sinh tồn, dùng Stars mua Gold & nâng cấp vũ khí.';

        const replyMarkup = {
          inline_keyboard: [
            [
              {
                text: '🎁 Lucky Box',
                web_app: { url: LUCKY_URL }
              }
            ],
            [
              {
                text: '🔫 Survival Shooter',
                web_app: { url: SHOOTER_URL }
              }
            ]
          ]
        };

        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: menuText,
            reply_markup: replyMarkup
          })
        });

        console.log('>> SENT START MENU to chat', chatId);
        return;
      }
    }

    // các loại update khác: bỏ qua

  } catch (e) {
    console.error('ERROR /webhook:', e);
  }
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on PORT =>', PORT);
  if (BOT_TOKEN) {
    console.log('BOT_TOKEN prefix =', BOT_TOKEN.slice(0, 10) + '***');
  }
});
