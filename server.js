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
  console.error('❌ MISSING BOT_TOKEN env var!');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;


// =======================================================
// =============== CREATE INVOICE (TELEGRAM STARS) =======
// =======================================================
app.post('/api/create-invoice', async (req, res) => {
  try {
    const { title, description, price_stars = 50, payload } = req.body;

    // ⭐ Telegram Stars: amount = stars * 100
    const body = {
      title,
      description,
      payload: payload || ('p' + Date.now()),
      currency: 'XTR',
      prices: [
        { label: title || "Item", amount: price_stars * 100 }
      ]
    };

    const resp = await fetch(`${TELEGRAM_API}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const json = await resp.json();

    console.log("== TELEGRAM RESPONSE createInvoiceLink ==", json);

    if (!json.ok) {
      return res.json({
        ok: false,
        error: json.description || "Unknown",
        raw_response: json
      });
    }

    return res.json({
      ok: true,
      invoiceLink: json.result
    });

  } catch (e) {
    console.error("❌ ERROR /api/create-invoice:", e);
    return res.json({ ok: false, error: e.message });
  }
});


// =======================================================
// ===================== DELIVER REWARD ==================
// =======================================================
app.post('/api/deliver', async (req, res) => {
  try {
    const { payload } = req.body;

    console.log("Deliver reward for payload:", payload);

    const reward =
      "LUCKY-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    return res.json({
      ok: true,
      reward
    });

  } catch (e) {
    console.error("❌ ERROR /api/deliver:", e);
    return res.json({ ok: false, error: e.message });
  }
});


// =======================================================
// ===================== WEBHOOK (OPTIONAL) ==============
// =======================================================
app.post('/webhook', async (req, res) => {
  try {
    const upd = req.body;
    console.log("== WEBHOOK RECEIVED ==", upd);

    res.sendStatus(200);

    // --- Pre-checkout (Stars) ---
    if (upd.pre_checkout_query) {
      await fetch(`${TELEGRAM_API}/answerPreCheckoutQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pre_checkout_query_id: upd.pre_checkout_query.id,
          ok: true
        })
      });

      console.log(">> PRE CHECKOUT ACCEPTED");
      return;
    }

    // --- Successful payment ---
    if (upd.message?.successful_payment) {
      const chatId = upd.message.chat.id;

      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Thanh toán thành công! 🎉 Bạn sẽ nhận phần thưởng ngay."
        })
      });

      return;
    }

  } catch (e) {
    console.error("❌ ERROR WEBHOOK:", e);
  }
});


// =======================================================
// ====================== START SERVER ====================
// =======================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server listening on PORT => ${PORT}`)
);
