// ════════════════════════════════════════════
// NANA V3 — 交易訊號 LINE 推播後端（通知版 + CORS）
// ════════════════════════════════════════════
import express from 'express';
const app = express();
app.use(express.json());

// ── CORS ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const { LINE_TOKEN, LINE_USER_ID } = process.env;

app.get('/', (req, res) => res.send('NANA bot is running ✓'));

// ── 接收 V3 訊號 ──
app.post('/signal', async (req, res) => {
  try {
    const b = req.body || {};
    let msg;
    if (b.test) {
      msg = '✅ V3 連線測試成功！\nWebhook 已接通，之後偵測到進場訊號會自動推播到這裡。';
    } else {
      const dirTxt = b.action === 'LONG' ? '做多 🟢' : '做空 🔴';
      const head = b.diamond ? '💎 V3 高信心訊號' : '⚡ V3 進場訊號';
      msg =
        `${head}\n` +
        `━━━━━━━━━━━━\n` +
        `幣種：${b.symbol}\n` +
        `方向：${dirTxt}\n` +
        `開倉價格：${b.price}\n` +
        `\n` +
        `止盈價格：\n` +
        `TP1　${b.tp1}\n` +
        `TP2　${b.tp2}\n` +
        `TP3　${b.tp3}\n` +
        `\n` +
        `止損價格：${b.sl}\n` +
        `━━━━━━━━━━━━\n` +
        `信心：${b.score ?? b.confidence} 分\n` +
        `⚠️ 請手動確認後再進場`;
    }
    await pushLine(msg);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

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

// ── 測試推播（用真實格式預覽）──
app.get('/test', async (req, res) => {
  const demo =
    '💎 V3 高信心訊號\n' +
    '━━━━━━━━━━━━\n' +
    '幣種：BTC\n' +
    '方向：做多 🟢\n' +
    '開倉價格：100,250\n' +
    '\n' +
    '止盈價格：\n' +
    'TP1　101,750\n' +
    'TP2　103,250\n' +
    'TP3　104,750\n' +
    '\n' +
    '止損價格：99,250\n' +
    '━━━━━━━━━━━━\n' +
    '信心：87 分\n' +
    '⚠️ 請手動確認後再進場\n' +
    '（這是測試範例）';
  await pushLine(demo);
  res.send('已送出測試訊息，請看你的 LINE');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('NANA bot on port', PORT));
