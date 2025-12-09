// server.js
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const bodyParser = require('body-parser');
const cors = require('cors');              // << thêm
const app = express();

app.use(cors());                           // << thêm
app.use(bodyParser.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
if(!BOT_TOKEN) {
  console.error('MISSING BOT_TOKEN env var!');
  process.exit(1);
}
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Create invoice
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

// Deliver reward
app.post('/api/deliver', async (req, res) => {
  try {
    const { payload } = req.body;
    const rewardCode = 'LUCKY-' + Math.random().toString(36).slice(2,10).toUpperCase();
    res.json({ ok:true, reward: rewardCode });
  } catch (e) {
    res.json({ ok:false, error: e.message });
  }
});

// Telegram webhook
app.post('/webhook', async (req, res) => {
  try {
    const upd = req.body;
    res.sendStatus(200);

    if(upd.pre_checkout_query){
      const id = upd.pre_checkout_query.id;
      await fetch(`${TELEGRAM_API}/answerPreCheckoutQuery`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ pre_checkout_query_id: id, ok: true })
      });
      return;
    }

    if(upd.message && upd.message.successful_payment){
      const payment = upd.message.successful_payment;
      console.log('Payment succeeded:', payment);

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
