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

// ================== HEALTH CHECK ==================
app.get('/', (req, res) => {
  res.send('Telegram Stars backend is running');
});

// ================== CREATE INVOICE ==================
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

    // CHÚ Ý: KHÔNG gửi provider_token với Stars (theo changelog Telegram)
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

// ================== DELIVER REWARD (giản lược) ==================
app.post('/api/deliver', async (req, res) => {
  try {
    const { payload } = req.body;
    console.log('Deliver reward for payload:', payload);

    const rewardCode =
      'LUCKY-' + Math.random().toString(36).slice(2, 10).toUpperCase();

    // Ở bản đơn giản: tin tưởng status "paid" từ openInvoice hoặc webhook
    return res.json({
      ok: true,
      reward: rewardCode
    });
  } catch (e) {
    console.error('ERROR /api/deliver:', e);
    return res.json({ ok: false, error: e.message });
  }
});

// ================== WEBHOOK (bắt buộc cho payment) ==================
app.post('/webhook', async (req, res) => {
  try {
    const upd = req.body;
    console.log('== WEBHOOK RECEIVED ==', JSON.stringify(upd, null, 2));

    // Trả 200 ngay
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

    // 2) Payment thành công (telegram gửi successful_payment)
    if (upd.message && upd.message.successful_payment) {
      const payment = upd.message.successful_payment;
      console.log('>> PAYMENT SUCCESS (via webhook):', payment);

      const chatId = upd.message.chat.id;

      // Thông báo cho user (tuỳ thích)
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'Thanh toán Stars thành công! Bạn sẽ nhận phần thưởng trong Mini App.'
        })
      });

      // Ở đây bạn có thể lưu payment vào DB, v.v.
      return;
    }

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
