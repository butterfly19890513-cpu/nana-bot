// ════════════════════════════════════════════
// NANA V3 — 交易訊號 LINE 推播後端（通知版 + CORS）
// ════════════════════════════════════════════
import express from 'express';
const app = express();
app.use(express.json());

// ── CORS：允許 V3（本機檔案/任何來源）連線 ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const { LINE_TOKEN, LINE_USER_ID } = process.env;

// 健康檢查
app.get('/', (req, res) => res.send('NANA bot is running ✓'));

// ── 接收 V3 訊號 ──
app.post('/signal', async (req, res) => {
  try {
    const b = req.body || {};
    let msg;
    if (b.test) {
      msg = '✅ V3 連線測試成功！\nWebhook 已接通，之後偵測到進場訊號會自動推播到這裡。';
    } else {
      const { symbol, action, price, confidence, diamond } = b;
      const emoji = diamond ? '💎' : (action === 'LONG' ? '🟢' : '🔴');
      const dirTxt = action === 'LONG' ? '做多' : '做空';
      msg =
        `${emoji} V3 訊號\n` +
        `${symbol} ${dirTxt}\n` +
        `價格：${price}\n` +
        `信心：${confidence}/5${diamond ? '（高信心）' : ''}\n\n` +
        `⚠️ 請手動確認後再進場`;
    }
    await pushLine(msg);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

// ── 推播到 LINE ──
async function pushLine(text) {
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_TOKEN}`
    },
    body: JSON.stringify({
      to: LINE_USER_ID,
      messages: [{ type: 'text', text }]
    })
  });
  if (!r.ok) console.error('LINE push failed', await r.text());
}

// ── 測試推播（瀏覽器打開 /test）──
app.get('/test', async (req, res) => {
  await pushLine('✅ NANA bot 測試訊息 — 連線成功！');
  res.send('已送出測試訊息，請看你的 LINE');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('NANA bot on port', PORT));
