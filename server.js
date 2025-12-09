// server.js
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
if(!BOT_TOKEN) {
  console.error('MISSING BOT_TOKEN env var!');
  process.exit(1);
}
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

app.post('/api/create-invoice', async (req, res) => {
  try {
    const { title, description, price_stars = 50, payload } = req.body;
    const body = {
      title,
      description,
      payload: payload || ('p' + Date.now()),
      currency: 'XTR',
      prices: [{ label: 'Lucky Box', amount: price_stars }]
    };
    const resp = await fetch(`${TELEGRAM_API}/createInvoiceLink`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    const j = await resp.json();
    if(!j.ok) return res.json({ ok:false, error: j.description || JSON.stringify(j) });
    return res.json({ ok:true, invoiceLink: j.result });
  } catch (e) {
    console.error(e);
    res.json({ ok:false, error: e.message });
  }
});

// Deliver endpoint - in production verify payment via webhook record
app.post('/api/deliver', async (req, res) => {
  try {
    const { payload } = req.body;
    // PRODUCTION: verify this payload against DB or payment records received via webhook
    // For demo we return a fake code
    const rewardCode = 'LUCKY-' + Math.random().toString(36).slice(2,10).toUpperCase();
    // Optionally use bot to send message to user (need chat id), or store in DB
    res.json({ ok:true, reward: rewardCode });
  } catch (e) {
    res.json({ ok:false, error: e.message });
  }
});

/*
  Webhook for Telegram updates (setWebhook to this URL). Handle:
   - pre_checkout_query: respond with answerPreCheckoutQuery
   - message with successful_payment: record payment and deliver reward
*/
app.post('/webhook', async (req, res) => {
  try {
    const upd = req.body;
    // respond quickly
    res.sendStatus(200);

    if(upd.pre_checkout_query){
      // For Stars, Telegram may call pre_checkout_query before charge. We should verify details if needed.
      const id = upd.pre_checkout_query.id;
      // For simplicity, accept
      await fetch(`${TELEGRAM_API}/answerPreCheckoutQuery`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ pre_checkout_query_id: id, ok: true })
      });
      return;
    }

    if(upd.message && upd.message.successful_payment){
      // A successful payment happened (store info, mark invoice as paid)
      const payment = upd.message.successful_payment;
      // payment contains telegram_payment_charge_id and provider_payment_charge_id
      console.log('Payment succeeded:', payment);
      // Save to DB: payment.invoice_payload / chat id etc (not shown)
      // Optionally send message to user with reward (if not delivered)
      // Example: sendMessage to chat:
      const chatId = upd.message.chat.id;
      const text = `Cảm ơn! Thanh toán thành công. Bạn sẽ nhận phần thưởng trong WebApp.`;
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ chat_id: chatId, text })
      });
    }
  } catch (e) {
    console.error(e);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server listening on', PORT));
