diff --git a/server.js b/server.js
new file mode 100644
index 0000000000000000000000000000000000000000..3c07fbc6fa311cb7bd3daeb75f47d20d72061aad
--- /dev/null
+++ b/server.js
@@ -0,0 +1,152 @@
+const express = require('express');
+const cors = require('cors');
+
+// Node 18+ has fetch built-in, fallback to node-fetch for older runtimes
+const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));
+
+const app = express();
+
+app.use(cors());
+app.use(express.json());
+
+const BOT_TOKEN = process.env.BOT_TOKEN;
+if (!BOT_TOKEN) {
+  console.error('MISSING BOT_TOKEN env var!');
+  process.exit(1);
+}
+
+const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
+
+app.get('/', (req, res) => {
+  res.send('Telegram Stars backend is running');
+});
+
+function validatePrice(price) {
+  if (typeof price !== 'number' || Number.isNaN(price)) return 'price_stars phải là số';
+  if (!Number.isInteger(price)) return 'price_stars phải là số nguyên';
+  if (price <= 0) return 'price_stars phải > 0';
+  return null;
+}
+
+app.post('/api/create-invoice', async (req, res) => {
+  try {
+    const {
+      title = 'Lucky Box',
+      description = 'Mua 1 Lucky Box để nhận phần thưởng digital',
+      price_stars = 50,
+      payload
+    } = req.body || {};
+
+    const priceError = validatePrice(price_stars);
+    if (priceError) {
+      return res.status(400).json({ ok: false, error: priceError });
+    }
+
+    if (!payload || typeof payload !== 'string') {
+      return res.status(400).json({ ok: false, error: 'payload bắt buộc là string' });
+    }
+
+    const body = {
+      title,
+      description,
+      payload,
+      provider_token: '',
+      currency: 'XTR',
+      prices: [
+        {
+          label: title || 'Lucky Box',
+          amount: price_stars
+        }
+      ]
+    };
+
+    const resp = await fetch(`${TELEGRAM_API}/createInvoiceLink`, {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify(body)
+    });
+
+    if (!resp.ok) {
+      const text = await resp.text();
+      console.error('Telegram createInvoiceLink HTTP error', resp.status, text);
+      return res.status(500).json({ ok: false, error: 'Không gọi được Telegram API', status: resp.status });
+    }
+
+    const j = await resp.json();
+    console.log('== TELEGRAM RESPONSE createInvoiceLink ==', j);
+
+    if (!j.ok) {
+      return res.status(400).json({
+        ok: false,
+        error: j.description || 'Telegram trả về lỗi',
+        raw_response: j
+      });
+    }
+
+    return res.json({ ok: true, invoiceLink: j.result });
+  } catch (e) {
+    console.error('ERROR /api/create-invoice:', e);
+    return res.status(500).json({ ok: false, error: e.message });
+  }
+});
+
+app.post('/api/deliver', async (req, res) => {
+  try {
+    const { payload } = req.body || {};
+    if (!payload) {
+      return res.status(400).json({ ok: false, error: 'payload bắt buộc' });
+    }
+
+    console.log('Deliver reward for payload:', payload);
+
+    const rewardCode = 'LUCKY-' + Math.random().toString(36).slice(2, 10).toUpperCase();
+
+    return res.json({ ok: true, reward: rewardCode });
+  } catch (e) {
+    console.error('ERROR /api/deliver:', e);
+    return res.status(500).json({ ok: false, error: e.message });
+  }
+});
+
+app.post('/webhook', async (req, res) => {
+  try {
+    const upd = req.body;
+    console.log('== WEBHOOK RECEIVED ==', JSON.stringify(upd, null, 2));
+
+    res.sendStatus(200);
+
+    if (upd.pre_checkout_query) {
+      const id = upd.pre_checkout_query.id;
+
+      await fetch(`${TELEGRAM_API}/answerPreCheckoutQuery`, {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ pre_checkout_query_id: id, ok: true })
+      });
+
+      console.log('>> PRE CHECKOUT ACCEPTED:', id);
+      return;
+    }
+
+    if (upd.message && upd.message.successful_payment) {
+      const payment = upd.message.successful_payment;
+      console.log('>> PAYMENT SUCCESS:', payment);
+
+      const chatId = upd.message.chat.id;
+
+      await fetch(`${TELEGRAM_API}/sendMessage`, {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({
+          chat_id: chatId,
+          text: 'Thanh toán thành công! Bạn sẽ nhận phần thưởng ngay trong Mini App.'
+        })
+      });
+    }
+  } catch (e) {
+    console.error('ERROR WEBHOOK:', e);
+  }
+});
+
+const PORT = process.env.PORT || 3000;
+app.listen(PORT, () => console.log('Server listening on PORT =>', PORT));
