// ════════════════════════════════════════════════════════
// NANA V3 後端偵測版 — 24小時自動掃描 → 推播 LINE
// 完整邏輯：MTF + MACD + RSI + OI + ADX + SMC(馬刺) 加權計分
// ════════════════════════════════════════════════════════
import express from 'express';
const app = express();
app.use(express.json());
app.use((req,res,next)=>{
  res.header('Access-Control-Allow-Origin','*');
  res.header('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.sendStatus(200);
  next();
});

const { LINE_TOKEN, LINE_USER_ID } = process.env;
const THRESHOLD = parseInt(process.env.THRESHOLD || '80');     // 推播門檻分數
const SL_PCT    = parseFloat(process.env.SL_PCT || '1');       // 止損%
const WATCHLIST = (process.env.WATCHLIST ||
  'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,AVAXUSDT').split(',');

// ═══════════ MATH ═══════════
function calcEMA(d,p){if(d.length<p)return Array(d.length).fill(NaN);const k=2/(p+1);const r=Array(p-1).fill(NaN);let e=d.slice(0,p).reduce((a,b)=>a+b,0)/p;r.push(e);for(let i=p;i<d.length;i++){e=d[i]*k+e*(1-k);r.push(e)}return r}
function calcMACD(d,f=12,s=26,sg=9){const ef=calcEMA(d,f),es=calcEMA(d,s);const ml=ef.map((v,i)=>isNaN(v)||isNaN(es[i])?NaN:v-es[i]);const vm=ml.filter(v=>!isNaN(v));const sr=calcEMA(vm,sg);const sig=Array(ml.length-sr.length).fill(NaN).concat(sr);const h=ml.map((v,i)=>isNaN(v)||isNaN(sig[i])?NaN:v-sig[i]);return{h}}
function calcRSI(d,p=14){if(d.length<p+1)return NaN;const c=d.slice(1).map((v,i)=>v-d[i]);let g=0,l=0;for(let i=0;i<p;i++){if(c[i]>0)g+=c[i];else l+=Math.abs(c[i])}let ag=g/p,al=l/p;for(let i=p;i<c.length;i++){const gg=c[i]>0?c[i]:0,ll=c[i]<0?Math.abs(c[i]):0;ag=(ag*(p-1)+gg)/p;al=(al*(p-1)+ll)/p}if(al===0)return 100;return 100-100/(1+ag/al)}
function biasAt(closes){if(closes.length<21)return 0;const e13=calcEMA(closes,13),e21=calcEMA(closes,21);const l=closes.length-1;return e13[l]>e21[l]?1:e13[l]<e21[l]?-1:0}
function calcADX(kl,period=14){if(!kl||kl.length<period*2)return 20;const h=kl.map(b=>b.h),l=kl.map(b=>b.l),c=kl.map(b=>b.c);const tr=[],pdm=[],mdm=[];for(let i=1;i<kl.length;i++){const up=h[i]-h[i-1],dn=l[i-1]-l[i];pdm.push(up>dn&&up>0?up:0);mdm.push(dn>up&&dn>0?dn:0);tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])))}const sm=a=>{let s=a.slice(0,period).reduce((x,y)=>x+y,0);const o=[s];for(let i=period;i<a.length;i++){s=s-s/period+a[i];o.push(s)}return o};const trS=sm(tr),pS=sm(pdm),mS=sm(mdm),dx=[];for(let i=0;i<trS.length;i++){const pdi=100*pS[i]/(trS[i]||1),mdi=100*mS[i]/(trS[i]||1);dx.push(100*Math.abs(pdi-mdi)/((pdi+mdi)||1))}if(dx.length<period)return dx[dx.length-1]||20;let adx=dx.slice(0,period).reduce((x,y)=>x+y,0)/period;for(let i=period;i<dx.length;i++)adx=(adx*(period-1)+dx[i])/period;return adx}
function oiThreshold(sym){if(sym==='BTCUSDT'||sym==='ETHUSDT')return 0.5;const m=['SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT'];return m.includes(sym)?0.8:1.2}
function calcSMC(kl){if(!kl||kl.length<60)return null;const bars=kl.slice(-180);const L=5;const sw=[];for(let i=L;i<bars.length-L;i++){let isH=true,isL=true;for(let j=1;j<=L;j++){if(bars[i].h<bars[i-j].h||bars[i].h<bars[i+j].h)isH=false;if(bars[i].l>bars[i-j].l||bars[i].l>bars[i+j].l)isL=false}if(isH)sw.push({idx:i,price:bars[i].h,type:'H'});if(isL)sw.push({idx:i,price:bars[i].l,type:'L'})}const H=sw.filter(s=>s.type==='H'),Lo=sw.filter(s=>s.type==='L');if(H.length<2||Lo.length<2)return null;const lH=H[H.length-1],pH=H[H.length-2],lL=Lo[Lo.length-1],pL=Lo[Lo.length-2];const price=bars[bars.length-1].c;let trend='range';if(lH.price>pH.price&&lL.price>pL.price)trend='up';else if(lH.price<pH.price&&lL.price<pL.price)trend='down';const lastSwingIsHigh=lH.idx>lL.idx;const hi=lH.price,lo=lL.price,range=hi-lo||1;const f50=lastSwingIsHigh?hi-range*0.5:lo+range*0.5;const f618=lastSwingIsHigh?hi-range*0.618:lo+range*0.618;const zHi=Math.max(f50,f618),zLo=Math.min(f50,f618);const inZone=price<=zHi&&price>=zLo;const smcDir=lastSwingIsHigh?'bull':'bear';return{trend,inZone,smcDir}}

// ═══════════ FETCH ═══════════
async function fetchKlines(sym,intv,lim=200){try{const r=await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${intv}&limit=${lim}`);if(!r.ok)return null;const d=await r.json();return d.map(k=>({o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]}))}catch{return null}}
async function fetchTicker(sym){try{const r=await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`);if(!r.ok)return null;const d=await r.json();return{price:+d.lastPrice,chg:+d.priceChangePercent,vol:+d.quoteVolume}}catch{return null}}
async function fetchOI(sym){try{const[c,h]=await Promise.all([fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`).then(r=>r.json()),fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=12`).then(r=>r.json())]);const on=h&&h.length>1?+h[h.length-1].sumOpenInterestValue:0;const op=h&&h.length>1?+h[0].sumOpenInterestValue:0;return{chg:op>0?((on-op)/op*100):0}}catch{return{chg:0}}}

// ═══════════ SIGNAL ═══════════
async function calcNANA(sym){
  const[k1h,k4h,k1d,k15m]=await Promise.all([fetchKlines(sym,'1h',500),fetchKlines(sym,'4h',200),fetchKlines(sym,'1d',100),fetchKlines(sym,'15m',200)]);
  if(!k1h)return null;
  const C=k=>k?k.map(b=>b.c):[];
  const c1h=C(k1h),c4h=C(k4h),c1d=C(k1d),c15=C(k15m);
  const b1d=biasAt(c1d),b4h=biasAt(c4h),b1h=biasAt(c1h),b15=biasAt(c15);
  const bull=[b1d,b4h,b1h,b15].filter(b=>b===1).length;
  const bear=[b1d,b4h,b1h,b15].filter(b=>b===-1).length;
  const m=calcMACD(c1h);const lh=m.h[m.h.length-1]??0,ph=m.h[m.h.length-2]??0;
  const macdBull=lh>0&&lh>ph,macdBear=lh<0&&lh<ph;
  const rsi=calcRSI(c1h,14);
  const e200=calcEMA(c1h,200);const above=c1h[c1h.length-1]>e200[e200.length-1];
  const adx=calcADX(k1h,14);const smc=calcSMC(k1h);
  let nana='neutral';
  if(b1h===1&&macdBull&&above&&bull>=3)nana='bull';
  else if(b1h===-1&&macdBear&&!above&&bear>=3)nana='bear';
  return{bull,bear,macdBull,macdBear,rsi:isNaN(rsi)?50:rsi,above,adx,smc,nana};
}
function buildEntry(sym,t,oi,nana){
  const pu=t.chg>0,pd=t.chg<0,ou=oi.chg>0;const oiThr=oiThreshold(sym);
  let dir='neutral';
  if(nana.nana==='bull'&&ou&&pu)dir='bull';
  else if(nana.nana==='bear'&&!ou&&pd)dir='bear';
  else if(nana.nana==='bull'||(ou&&pu))dir='wait-bull';
  else if(nana.nana==='bear'||(!ou&&pd))dir='wait-bear';
  const isLong=dir==='bull'||dir==='wait-bull',isShort=dir==='bear'||dir==='wait-bear';
  const mtfPass=nana.bull>=3||nana.bear>=3,mtfWarn=nana.bull===2||nana.bear===2;
  const macdPass=(isLong&&nana.macdBull)||(isShort&&nana.macdBear);
  const oiDirPass=(isLong&&oi.chg>0&&pu)||(isShort&&oi.chg<0&&pd);
  const oiDirHalf=!oiDirPass&&((isLong&&ou)||(isShort&&!ou))&&Math.abs(oi.chg)>=0.3;
  const oiStrPass=Math.abs(oi.chg)>=oiThr,oiStrWarn=Math.abs(oi.chg)>=oiThr*0.4&&!oiStrPass;
  const rsiVeto=(isLong&&nana.rsi>72)||(isShort&&nana.rsi<28);
  const adxChop=nana.adx<20;
  const smc=nana.smc;let smcBonus=0;
  if(smc){const al=(isLong&&smc.smcDir==='bull')||(isShort&&smc.smcDir==='bear');if(al)smcBonus+=6;if(al&&smc.inZone)smcBonus+=4}
  let score=0;
  if(mtfPass)score+=30;else if(mtfWarn)score+=12;
  if(oiDirPass)score+=25;else if(oiDirHalf)score+=10;
  if(macdPass)score+=20;
  if(oiStrPass)score+=15;else if(oiStrWarn)score+=6;
  score+=smcBonus;
  if(rsiVeto)score-=20;if(adxChop)score-=15;
  score=Math.max(0,Math.min(100,Math.round(score)));
  const dmatch=(nana.nana==='bull'&&dir==='bull')||(nana.nana==='bear'&&dir==='bear');
  let action='no-go';
  if(score>=85&&dmatch)action='diamond';
  else if(dir==='bull'&&score>=70)action='go-long';
  else if(dir==='bear'&&score>=70)action='go-short';
  else if(score>=55)action='standby';
  return{score,action,isLong,isShort,diamond:action==='diamond'};
}
function calcTPSL(price,entry){
  const dir=entry.isLong?1:-1,slPct=SL_PCT/100;
  return{entry:price,sl:price*(1-dir*slPct),tp1:price*(1+dir*slPct*1.5),tp2:price*(1+dir*slPct*3),tp3:price*(1+dir*slPct*4.5)};
}
const fmt=n=>n>100?n.toLocaleString('en',{maximumFractionDigits:1}):n.toFixed(4);

// ═══════════ SCAN ═══════════
const sentSignals={};
async function scanOne(sym){
  const[t,oi,nana]=await Promise.all([fetchTicker(sym),fetchOI(sym),calcNANA(sym)]);
  if(!t||!nana)return null;
  const entry=buildEntry(sym,t,oi,nana);
  if(entry.score<THRESHOLD)return null;
  if(entry.action==='no-go'||entry.action==='standby')return null;
  const action=entry.isLong?'LONG':'SHORT';
  const now=Date.now(),prev=sentSignals[sym];
  if(prev&&prev.action===action&&(now-prev.ts)<60*60*1000)return null; // 同方向60分冷卻
  sentSignals[sym]={action,ts:now};
  const tp=calcTPSL(t.price,entry);
  const dirTxt=action==='LONG'?'做多 🟢':'做空 🔴';
  const head=entry.diamond?'💎 V3 高信心訊號':'⚡ V3 進場訊號';
  const msg=`${head}\n━━━━━━━━━━━━\n幣種：${sym.replace('USDT','')}\n方向：${dirTxt}\n開倉價格：${fmt(tp.entry)}\n\n止盈價格：\nTP1　${fmt(tp.tp1)}\nTP2　${fmt(tp.tp2)}\nTP3　${fmt(tp.tp3)}\n\n止損價格：${fmt(tp.sl)}\n━━━━━━━━━━━━\n信心：${entry.score} 分\n⚠️ 請手動確認後再進場`;
  await pushLine(msg);
  return{sym:sym.replace('USDT',''),score:entry.score,action};
}
async function scanAll(){
  const hits=[];
  for(const sym of WATCHLIST){try{const r=await scanOne(sym);if(r)hits.push(r)}catch(e){console.error(sym,e.message)}}
  return hits;
}

// ═══════════ LINE ═══════════
async function pushLine(text){
  const r=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${LINE_TOKEN}`},body:JSON.stringify({to:LINE_USER_ID,messages:[{type:'text',text}]})});
  if(!r.ok)console.error('LINE push failed',await r.text());
}

// ═══════════ ENDPOINTS ═══════════
app.get('/',(req,res)=>res.send('NANA bot 24hr 偵測版 running ✓'));

// 定時掃描入口（給 cron 每5-10分鐘戳一次）
app.get('/scan',async(req,res)=>{
  const hits=await scanAll();
  res.json({ok:true,scanned:WATCHLIST.length,threshold:THRESHOLD,signals:hits,time:new Date().toISOString()});
});

// 手動測試掃描（會真的推播符合條件的）
app.get('/test',async(req,res)=>{
  await pushLine('✅ NANA bot 24hr 偵測版 上線！\n之後會每隔幾分鐘自動掃描，偵測到 '+THRESHOLD+' 分以上訊號就推這裡。');
  res.send('已送出測試訊息，請看 LINE');
});

// 保留：V3 前端手動推送（相容舊功能）
app.post('/signal',async(req,res)=>{
  try{const b=req.body||{};let msg;
    if(b.test){msg='✅ V3 連線測試成功！Webhook 已接通。';}
    else{const dirTxt=b.action==='LONG'?'做多 🟢':'做空 🔴';const head=b.diamond?'💎 V3 高信心訊號':'⚡ V3 進場訊號';
      msg=`${head}\n━━━━━━━━━━━━\n幣種：${b.symbol}\n方向：${dirTxt}\n開倉價格：${b.price}\n\n止盈價格：\nTP1　${b.tp1}\nTP2　${b.tp2}\nTP3　${b.tp3}\n\n止損價格：${b.sl}\n━━━━━━━━━━━━\n信心：${b.score??b.confidence} 分\n⚠️ 請手動確認後再進場`;}
    await pushLine(msg);res.json({ok:true});
  }catch(e){console.error(e);res.status(500).json({ok:false})}
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('NANA 24hr bot on',PORT,'| threshold',THRESHOLD,'| watch',WATCHLIST.length));
