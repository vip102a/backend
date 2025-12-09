// server.js
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(bodyParser.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('MISSING BOT_TOKEN env var!');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;


// ===================== CREATE INVOICE ==========================
app.post('/api/create-invoice', async (req, res) => {
  try {
    const { title, description, price_stars = 50, payload } = req.body;

    const body = {
      title,
      description,
      payload: payload || ('p' + Date.now()),
      currency: 'XTR',
      prices: [
        { label: 'Lucky Box', amount: price_stars * 100 } // ⭐ IMPORTANT!
      ]
    };

    const resp = await fetch(`${TELEGRAM_API}/createStarInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const j = await resp.json();

    // LOG FULL RESPONSE FROM TELEGRAM
    console.log("== TELEGRAM RESPONSE createInvoiceLink ==", j);

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


// =================== WEBHOOK (FOR REAL FUTURE USE) ==================
app.post('/webhook', async (req, res) => {
  try {
    const upd = req.body;
    console.log("== WEBHOOK RECEIVED ==", upd);

    res.sendStatus(200);

    // 1) Handle pre checkout query
    if (upd.pre_checkout_query) {
      const id = upd.pre_checkout_query.id;

      // Accept payment ALWAYS
      await fetch(`${TELEGRAM_API}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_checkout_query_id: id, ok: true })
      });

      console.log(">> PRE CHECKOUT ACCEPTED");
      return;
    }

    // 2) Handle successful payment
    if (upd.message && upd.message.successful_payment) {
      const payment = upd.message.successful_payment;
      console.log('>> PAYMENT SUCCESS:', payment);

      const chatId = upd.message.chat.id;

      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Thanh toán thành công! Bạn sẽ nhận phần thưởng ngay."
        })
      });

      return;
    }

  } catch (e) {
    console.error('ERROR WEBHOOK:', e);
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on PORT =>', PORT));

