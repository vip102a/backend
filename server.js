// server.js
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// ========== BOT TOKEN ==========
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('MISSING BOT_TOKEN env var!');
  process.exit(1);
}

// Không in full token để tránh lộ ra log
console.log('Bot started. BOT_TOKEN prefix =', BOT_TOKEN.slice(0, 10) + '***');

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;


// ===================== HEALTH CHECK =====================
app.get('/', (req, res) => {
  res.send('Telegram Stars backend is running');
});


// ===================== CREATE INVOICE ==========================
app.post('/api/create-invoice', async (req, res) => {
  try {
    const {
      title = 'Lucky Box',
      description = 'Mua 1 Lucky Box để nhận phần thưởng digital',
      price_stars = 50,          // số sao, KHÔNG nhân 100
      payload
    } = req.body;

    const body = {
      title,
      description,
      payload: payload || ('p' + Date.now()),
      provider_token: '',        // Stars: để chuỗi rỗng
      currency: 'XTR',           // tiền tệ là Telegram Stars
      prices: [
        {
          label: title || 'Lucky Box',
          amount: price_stars     // 50 sao => amount: 50
        }
      ]
    };

    const resp = await fetch(`${TELEGRAM_API}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const j = await resp.json();

    // LOG FULL RESPONSE TỪ TELEGRAM
    console.log('== TELEGRAM RESPONSE createInvoiceLink ==', j);

    if (!j.ok) {
      return res.json({
        ok: false,
        error: j.description || 'Unknown',
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


// ======================= DELIVER REWARD ===========================
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


// =================== WEBHOOK (FUTURE USE) ==================
app.post('/webhook', async (req, res) => {
  try {
    const upd = req.body;
    console.log('== WEBHOOK RECEIVED ==', JSON.stringify(upd, null, 2));

    // Telegram yêu cầu trả 200 càng sớm càng tốt
    res.sendStatus(200);

    // 1) Pre-checkout (bắt buộc approve)
    if (upd.pre_checkout_query) {
      const id = upd.pre_checkout_query.id;

      await fetch(`${TELEGRAM_API}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: id,
          ok: true
        })
      });

      console.log('>> PRE CHECKOUT ACCEPTED:', id);
      return;
    }

    // 2) Thanh toán thành công
    if (upd.message && upd.message.successful_payment) {
      const payment = upd.message.successful_payment;
      console.log('>> PAYMENT SUCCESS:', payment);

      const chatId = upd.message.chat.id;

      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'Thanh toán thành công! Bạn sẽ nhận phần thưởng ngay trong Mini App.'
        })
      });

      return;
    }

  } catch (e) {
    console.error('ERROR WEBHOOK:', e);
  }
});


// =================== START SERVER ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on PORT =>', PORT));
