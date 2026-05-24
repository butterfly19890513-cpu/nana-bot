// ════════════════════════════════════════════
// NANA V3 — 交易訊號 LINE 推播後端（通知版）
// 第一階段：只推播通知，手動下單。穩定後再加自動下單。
// ════════════════════════════════════════════
import express from 'express';
const app = express();
app.use(express.json());

const { LINE_TOKEN, LINE_USER_ID } = process.env;

// 健康檢查（Render 會打這個確認服務活著）
app.get('/', (req, res) => res.send('NANA bot is running ✓'));

// ── 接收 V3 指揮中心送來的訊號 ──
app.post('/signal', async (req, res) => {
  try {
    const { symbol, action, price, confidence, diamond } = req.body;
    const emoji = diamond ? '💎' : (action === 'LONG' ? '🟢' : '🔴');
    const dirTxt = action === 'LONG' ? '做多' : '做空';
    const msg =
      `${emoji} V3 訊號\n` +
      `${symbol} ${dirTxt}\n` +
      `價格：${price}\n` +
      `信心：${confidence}/5${diamond ? '（高信心）' : ''}\n\n` +
      `⚠️ 請手動確認後再進場`;

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

// ── 測試推播（瀏覽器打開 /test 就會收到一則 LINE）──
app.get('/test', async (req, res) => {
  await pushLine('✅ NANA bot 測試訊息 — 連線成功！');
  res.send('已送出測試訊息，請看你的 LINE');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('NANA bot on port', PORT));
