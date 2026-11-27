/* Market AI — static GitHub Pages app. Keys stay in this browser only. */

const LS_KEY = 'market-ai-providers-v1';
const CACHE_KEY = 'market-ai-cache-v1';
const MAX_MODELS = 30;

const SYMBOLS = {
  XAUUSD: {label:'Gold / الذهب', yahoo:'GC=F', query:'gold price XAUUSD', kind:'metal'},
  XAGUSD: {label:'Silver / الفضة', yahoo:'SI=F', query:'silver price XAGUSD', kind:'metal'},
  EURUSD: {label:'EUR/USD', yahoo:'EURUSD=X', query:'EUR USD forex', kind:'forex'},
  GBPUSD: {label:'GBP/USD', yahoo:'GBPUSD=X', query:'GBP USD forex', kind:'forex'},
  USDJPY: {label:'USD/JPY', yahoo:'USDJPY=X', query:'USD JPY forex', kind:'forex'},
  BTCUSD: {label:'Bitcoin', yahoo:'BTC-USD', query:'Bitcoin BTC price', kind:'crypto'},
  ETHUSD: {label:'Ethereum', yahoo:'ETH-USD', query:'Ethereum ETH price', kind:'crypto'},
  US500: {label:'S&P 500', yahoo:'^GSPC', query:'S&P 500 stock market', kind:'index'},
  US30: {label:'Dow Jones', yahoo:'^DJI', query:'Dow Jones stock market', kind:'index'},
  NAS100: {label:'Nasdaq', yahoo:'^IXIC', query:'Nasdaq stock market', kind:'index'},
  VIX: {label:'Volatility VIX', yahoo:'^VIX', query:'VIX volatility market', kind:'index'},
  DXY: {label:'US Dollar Index', yahoo:'DX-Y.NYB', query:'US dollar index DXY', kind:'macro'},
  US10Y: {label:'US 10Y yield', yahoo:'^TNX', query:'US treasury yields', kind:'macro'},
  WTI: {label:'WTI Oil', yahoo:'CL=F', query:'crude oil price', kind:'energy'}
};
const MACRO = ['DXY','US10Y','VIX','US500','BTCUSD','WTI'];
const INTERVALS = {
  M15:['15m','1mo',1], M30:['30m','1mo',1], H1:['60m','3mo',1],
  H4:['60m','3mo',4], D1:['1d','1y',1]
};
const TEMPLATES = [
  {name:'groq', base_url:'https://api.groq.com/openai/v1', model:'openai/gpt-oss-120b', api_key:'', enabled:true},
  {name:'gemini', base_url:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-3.5-flash-lite', api_key:'', enabled:true},
  {name:'mistral', base_url:'https://api.mistral.ai/v1', model:'mistral-small-latest', api_key:'', enabled:true},
  {name:'cerebras', base_url:'https://api.cerebras.ai/v1', model:'gpt-oss-120b', api_key:'', enabled:true},
  {name:'huggingface', base_url:'https://router.huggingface.co/v1', model:'openai/gpt-oss-120b', api_key:'', enabled:true},
  {name:'openai', base_url:'https://api.openai.com/v1', model:'gpt-4o-mini', api_key:'', enabled:true},
  {name:'custom', base_url:'', model:'', api_key:'', enabled:true}
];
// One key from these providers can drive several models in parallel.
const FREE_MODEL_SETS = {
  groq:{label:'Groq', base:'https://api.groq.com/openai/v1', models:[
    'openai/gpt-oss-120b','openai/gpt-oss-20b','qwen/qwen3.8-27b','allam-2-7b'
  ]},
  cerebras:{label:'Cerebras', base:'https://api.cerebras.ai/v1', models:[
    'gpt-oss-120b','qwen-3.8-27b'
  ]},
  gemini:{label:'Google Gemini', base:'https://generativelanguage.googleapis.com/v1beta/openai', models:[
    'gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-3.8-flash','gemini-4-hydrogen'
  ]},
  huggingface:{label:'Hugging Face', base:'https://router.huggingface.co/v1', models:[
    'openai/gpt-oss-120b','Qwen/Qwen3.8-27B','deepseek-ai/DeepSeek-V4.1-Flash-1017',
    'meta-llama/Llama-3.1-8B-Instruct'
  ]},
  mistral:{label:'Mistral', base:'https://api.mistral.ai/v1', models:[
    'mistral-small-latest','mistral-medium-latest','mistral-large-latest'
  ]}
};

const SYSTEM_PROMPT = `You are a disciplined institutional multi-asset trade analyst.
You receive REAL market data: price candles, indicators, macro instruments and news headlines.
Use ONLY the supplied data. Never invent prices, news or facts.
Study trend, momentum, volatility, support/resistance, macro risk and news together.
If signals conflict or news risk is high, choose WAIT. Never claim certainty.
Entry must be a realistic zone near the current price. Stop loss must be sensible.
Return ONLY one valid JSON object:
{"bias":"BUY"|"SELL"|"WAIT","confidence":0-100,"thesis":"2-3 short sentences",
"key_factors":["f1","f2","f3"],"news_impact":"short assessment",
"entry_zone":[low,high],"stop_loss":number or null,"take_profit":[tp1,tp2],
"risk_reward":number or null,"invalidation":"short condition",
"wait_conditions":"what must happen before entering or empty","time_horizon":"short label",
"risk_note":"short warning"}`;

/* ---------- helpers ---------- */
function esc(s){ return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmt(v){ return (v===null||v===undefined||v==='')?'-':String(v); }
function el(id){ return document.getElementById(id); }
function err(msg){
  const n=el('err'); if(n) n.textContent = msg || '';
  const q=el('quickMsg'); if(q) q.textContent = msg || '';
  if(!n && !q) console.warn(msg);
}

async function getJSON(url, ms=20000){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), ms);
  try{ const r = await fetch(url,{signal:ctl.signal, cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
  finally{ clearTimeout(t); }
}
async function getText(url, ms=20000){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), ms);
  try{ const r = await fetch(url,{signal:ctl.signal, cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.text(); }
  finally{ clearTimeout(t); }
}
function viaProxy(url){ return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); }
// Several free CORS bridges — try them in order so a single outage doesn't break the site.
const PROXIES = [
  u => viaProxy(u),
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  u => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u)
];
async function fetchViaProxies(url, kind='json', ms=10000){
  const errors=[];
  for(const make of PROXIES){
    try{
      const target=make(url);
      let txt;
      if(target.includes('allorigins.win/get')){
        const d=await getJSON(target,ms);
        txt=d.contents;
        if(!txt) throw new Error('empty response');
      }else{
        txt=await getText(target,ms);
      }
      return kind==='json'?JSON.parse(txt):txt;
    }catch(e){ errors.push(String(e.message||e).slice(0,80)); }
  }
  throw new Error('proxies failed: '+errors.join(' | '));
}

/* ---------- storage ---------- */
function providers(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }catch(e){ return []; }
}
function saveProviders(list){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(list)); return true; }
  catch(e){ err('مش قادر أحفظ في المتصفح: '+(e && e.message ? e.message : e)+'. جرّب تبويب عادي مش وضع خاص، وامسح بيانات الموقع لو ممتلئة.'); return false; }
}
function cacheGet(key){
  try{ const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); const hit = c[key]; if(hit && Date.now()-hit.t < 15*60*1000) return hit.v; }catch(e){}
  return null;
}
function cacheSet(key,value){
  try{ const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); c[key]={t:Date.now(),v:value}; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); }catch(e){}
}

/* ---------- provider UI ---------- */
function renderProviders(){
  const list = providers();
  const kc=el('keyCount'), mc=el('modelCount'), pl=el('providerList');
  if(kc) kc.textContent = new Set(list.filter(p=>p.api_key).map(p=>p.api_key)).size;
  if(mc) mc.textContent = list.filter(p=>p.api_key&&p.enabled&&p.base_url&&p.model).length;
  if(!pl) return;
  pl.innerHTML = list.length ? list.map(p=>`
    <div class="provider"><b>${esc(p.name)}</b> <span class="tiny">${esc(p.model)}</span>
      <div class="tiny">${p.api_key?'المفتاح محفوظ':'مفيش مفتاح'} · ${p.enabled?'مفعّل':'متوقف'}</div>
      <div class="row"><button class="mini" onclick="toggleProvider('${esc(p.name)}')">${p.enabled?'إيقاف':'تفعيل'}</button>
      <button class="mini danger" onclick="removeProvider('${esc(p.name)}')">حذف</button></div>
    </div>`).join('') : '<p class="note">مفيش مزودين. اضغط «أضف قوالب المزودين المجانيين».</p>';
}
function toggleSettings(){ const s=el('settings'); s.style.display = s.style.display==='none'?'block':'none'; }
function addTemplates(){
  const list = providers();
  TEMPLATES.forEach(t=>{ if(!list.some(p=>p.name===t.name)) list.push({...t}); });
  saveProviders(list); renderProviders();
}
// Expand one saved key into every free model that provider currently offers.
function addFreeModels(source){
  const set = FREE_MODEL_SETS[source];
  if(!set) return;
  const list = providers();
  const owner = list.find(p=>p.name.toLowerCase()===source);
  if(!owner || !owner.api_key){ err('ضيف مفتاح '+set.label+' الأول في خانة المزود، وبعدين اضغط الزر.'); return; }
  const base = (owner.base_url || set.base).replace(/\/$/,'');
  let added = 0;
  set.models.forEach(model=>{
    if(list.some(p=>p.model===model && (p.base_url||'').replace(/\/$/,'')===base)) return;
    const name = source+'-'+model.split('/').pop().replace(/[^a-z0-9._-]/gi,'-');
    list.push({name,base_url:base,model,api_key:owner.api_key,enabled:true});
    added++;
  });
  saveProviders(list); renderProviders();
  err(added ? `اتضافت ${added} نماذج مجانية من ${set.label} — كلهم هيحللوا بالتوازي.` : `كل نماذج ${set.label} موجودة بالفعل.`);
}
// One paste is enough: save the key and expand all free OpenRouter models.
function showSaveStatus(){
  const list = providers();
  const keys = new Set(list.filter(p=>p.api_key).map(p=>p.api_key)).size;
  const models = list.filter(p=>p.api_key&&p.enabled&&p.base_url&&p.model).length;
  err(keys ? `الحفظ شغال ✅ ${keys} مفتاح / ${models} نموذج محفوظين في هذا المتصفح.` : 'لسه مفيش مفتاح محفوظ في هذا المتصفح.');
}
function saveProvider(){
  const name = el('pName').value.trim();
  const base_url = el('pUrl').value.trim().replace(/\/$/,'');
  const model = el('pModel').value.trim();
  const key = el('pKey').value.trim();
  if(!name || !base_url || !model){ err('لازم الاسم والـ Base URL والموديل'); return; }
  const list = providers();
  const i = list.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
  const item = i>=0 ? list[i] : {name,api_key:'',enabled:true};
  item.base_url=base_url; item.model=model; if(key) item.api_key=key;
  if(i>=0) list[i]=item; else list.push(item);
  saveProviders(list); el('pKey').value=''; err(''); renderProviders();
}
function toggleProvider(name){ const list=providers(); const p=list.find(x=>x.name===name); if(p) p.enabled=!p.enabled; saveProviders(list); renderProviders(); }
function removeProvider(name){ if(!confirm('حذف '+name+'؟')) return; saveProviders(providers().filter(p=>p.name!==name)); renderProviders(); }

/* ---------- market data ---------- */
function resample(candles, factor){
  if(factor<=1 || !candles.length) return candles;
  const out=[];
  for(let i=0;i<candles.length;i+=factor){
    const g=candles.slice(i,i+factor); if(!g.length) continue;
    out.push({t:g[0].t,o:g[0].o,h:Math.max(...g.map(x=>x.h)),l:Math.min(...g.map(x=>x.l)),c:g[g.length-1].c,v:g.reduce((a,x)=>a+x.v,0)});
  }
  return out;
}
async function fetchCandles(symbol, interval){
  const cacheKey = 'c:'+symbol+':'+interval;
  const hit = cacheGet(cacheKey); if(hit) return hit;
  const [yi, range, factor] = INTERVALS[interval] || INTERVALS.H1;
  let candles = [];
  for(const host of ['query1','query2']){
    try{
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOLS[symbol].yahoo)}?range=${range}&interval=${yi}&includePrePost=false`;
      const data = await fetchViaProxies(url, 'json', 12000);
      const res = ((data.chart||{}).result||[])[0];
      if(res && res.timestamp){
        const q = ((res.indicators||{}).quote||[])[0] || {};
        const closes=q.close||[], opens=q.open||[], highs=q.high||[], lows=q.low||[], vols=q.volume||[];
        res.timestamp.forEach((ts,i)=>{
          const c = Number(closes[i]); if(!isFinite(c)) return;
          candles.push({t:ts,o:Number(opens[i]??c),h:Number(highs[i]??Math.max(Number(opens[i]??c),c)),
            l:Number(lows[i]??Math.min(Number(opens[i]??c),c)),c,v:Number(vols[i]||0)});
        });
        candles = resample(candles, factor);
      }
    }catch(e){ /* try next host / fallback below */ }
    if(candles.length) break;
  }
  if(!candles.length){
    try{
      if(symbol==='BTCUSD'||symbol==='ETHUSD'){
        const pair = symbol==='BTCUSD'?'BTCUSDT':'ETHUSDT';
        const rows = await getJSON(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1h&limit=100`,20000);
        candles = rows.map(r=>({t:Math.floor(r[0]/1000),o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]}));
      }else{
        const sym = symbol==='XAUUSD'?'XAU':symbol==='XAGUSD'?'XAG':null;
        if(sym){
          const d = await getJSON(`https://api.gold-api.com/price/${sym}`,15000);
          const p = Number(d.price);
          if(isFinite(p)) candles=[{t:Math.floor(Date.now()/1000),o:p,h:p,l:p,c:p,v:0}];
        }
      }
    }catch(e){}
  }
  if(candles.length) cacheSet(cacheKey,candles);
  return candles;
}
function ema(vals,p){ if(!vals.length) return null; const k=2/(p+1); let e=vals[0]; for(let i=1;i<vals.length;i++) e=vals[i]*k+e*(1-k); return e; }
function sma(vals,p){ return vals.length<p?null:vals.slice(-p).reduce((a,b)=>a+b,0)/p; }
function rsi(vals,p=14){ if(vals.length<=p) return null; let g=0,l=0; for(let i=vals.length-p;i<vals.length;i++){ const d=vals[i]-vals[i-1]; g+=Math.max(d,0); l+=Math.max(-d,0); } if(l===0) return 100; return 100-100/(1+(g/p)/(l/p)); }
function atr(cs,p=14){ if(cs.length<=p) return null; let s=0; for(let i=cs.length-p;i<cs.length;i++){ const c=cs[i], prev=cs[i-1].c; s+=Math.max(c.h-c.l,Math.abs(c.h-prev),Math.abs(c.l-prev)); } return s/p; }
function stoch(cs,p=14){ if(cs.length<p) return null; const w=cs.slice(-p), hi=Math.max(...w.map(x=>x.h)), lo=Math.min(...w.map(x=>x.l)); return hi===lo?50:100*(w[w.length-1].c-lo)/(hi-lo); }
function indicators(cs){
  if(!cs.length) return {};
  const cl=cs.map(c=>c.c), last=cl[cl.length-1], prev=cl[cl.length-2]??last;
  const m20=sma(cl,20), sd = cl.length>=20 ? Math.sqrt(cl.slice(-20).reduce((a,x)=>a+(x-cl.slice(-20).reduce((b,y)=>b+y,0)/20)**2,0)/20) : 0;
  const e20=ema(cl,20), e50=ema(cl,50), s50=sma(cl,50);
  const a=atr(cs), r=rsi(cl), st=stoch(cs);
  return {last:+last.toFixed(4),previous:+prev.toFixed(4),change_pct:+(((last-prev)/prev)*100).toFixed(3),
    ema20:e20?+e20.toFixed(4):null, ema50:e50?+e50.toFixed(4):null, sma200:sma(cl,200)?+sma(cl,200).toFixed(4):null,
    rsi14:r===null?null:+r.toFixed(1), atr14:a?+a.toFixed(4):null, atr_pct:a?+((a/last)*100).toFixed(3):null,
    bb_upper:m20?+(m20+2*sd).toFixed(4):null, bb_lower:m20?+(m20-2*sd).toFixed(4):null,
    stoch_k:st===null?null:+st.toFixed(1), high20:+Math.max(...cs.slice(-20).map(x=>x.h)).toFixed(4),
    low20:+Math.min(...cs.slice(-20).map(x=>x.l)).toFixed(4), bars:cs.length,
    trend: (e20&&s50)?(e20>s50&&last>e20?'bullish':e20<s50&&last<e20?'bearish':'mixed'):'unknown'};
}
/* ---------- rule-based strategy + real backtest (no AI) ---------- */
const STRAT = {fast:20, slow:50, rsi:14, atr:14, sl:2, tp:4, cost:0.00005, minTrades:20, minPF:1.2};
const HISTORY_CACHE = {};

function stratSeries(cs){
  const n=cs.length;
  const emaF=new Array(n).fill(null), emaS=new Array(n).fill(null),
        rsiA=new Array(n).fill(null), atrA=new Array(n).fill(null);
  if(!n) return {emaF,emaS,rsiA,atrA};
  let ef=cs[0].c, es=cs[0].c;
  const kf=2/(STRAT.fast+1), ks=2/(STRAT.slow+1);
  for(let i=0;i<n;i++){
    if(i){ ef=cs[i].c*kf+ef*(1-kf); es=cs[i].c*ks+es*(1-ks); }
    emaF[i]=ef; emaS[i]=es;
  }
  const p=STRAT.rsi;
  if(n>p){
    let g=0,l=0;
    for(let i=1;i<=p;i++){ const d=cs[i].c-cs[i-1].c; g+=Math.max(d,0); l+=Math.max(-d,0); }
    g/=p; l/=p; rsiA[p]=l===0?100:100-100/(1+g/l);
    for(let i=p+1;i<n;i++){
      const d=cs[i].c-cs[i-1].c;
      g=(g*(p-1)+Math.max(d,0))/p; l=(l*(p-1)+Math.max(-d,0))/p;
      rsiA[i]=l===0?100:100-100/(1+g/l);
    }
  }
  const ap=STRAT.atr;
  if(n>ap){
    const tr=i=>Math.max(cs[i].h-cs[i].l, Math.abs(cs[i].h-cs[i-1].c), Math.abs(cs[i].l-cs[i-1].c));
    let sum=0; for(let i=1;i<=ap;i++) sum+=tr(i);
    atrA[ap]=sum/ap;
    for(let i=ap+1;i<n;i++) atrA[i]=(atrA[i-1]*(ap-1)+tr(i))/ap;
  }
  return {emaF,emaS,rsiA,atrA};
}

function backtest(cs){
  const n=cs.length, {emaF,emaS,rsiA,atrA}=stratSeries(cs);
  const trades=[]; let pos=null;
  const cost=p=>p*STRAT.cost;
  function close(i,exit,reason){
    const risk=pos.side==='BUY'?pos.entry-pos.sl:pos.sl-pos.entry;
    const r=pos.side==='BUY'?(exit-pos.entry)/risk:(pos.entry-exit)/risk;
    trades.push({side:pos.side,entry:+pos.entry.toFixed(4),exit:+exit.toFixed(4),
      sl:+pos.sl.toFixed(4),tp:+pos.tp.toFixed(4),r:+r.toFixed(3),
      bars:i-pos.i,reason,t:cs[pos.i].t});
    pos=null;
  }
  for(let i=STRAT.slow+2;i<n-1;i++){
    if(pos && i>=pos.i){
      const b=cs[i], long=pos.side==='BUY';
      const hitSL=long?b.l<=pos.sl:b.h>=pos.sl;
      const hitTP=long?b.h>=pos.tp:b.l<=pos.tp;
      if(hitSL||hitTP){
        let exit=hitSL?pos.sl:pos.tp;
        if(hitSL&&(long?b.o<pos.sl:b.o>pos.sl)) exit=b.o;
        close(i,exit,hitSL?'SL':'TP');
      }else{
        const fade=long?(rsiA[i-1]>=50&&rsiA[i]<50):(rsiA[i-1]<=50&&rsiA[i]>50);
        const flip=long?emaF[i]<emaS[i]:emaF[i]>emaS[i];
        if(fade||flip) close(i,b.c,fade?'RSI':'EMA');
      }
    }
    if(!pos && rsiA[i-1]!==null && rsiA[i]!==null && atrA[i]){
      const up=rsiA[i-1]<=50&&rsiA[i]>50, dn=rsiA[i-1]>=50&&rsiA[i]<50;
      const next=cs[i+1];
      if(up&&emaF[i]>emaS[i]){
        const entry=next.o+cost(next.o);
        pos={side:'BUY',i:i+1,entry,sl:entry-STRAT.sl*atrA[i],tp:entry+STRAT.tp*atrA[i]};
      }else if(dn&&emaF[i]<emaS[i]){
        const entry=next.o-cost(next.o);
        pos={side:'SELL',i:i+1,entry,sl:entry+STRAT.sl*atrA[i],tp:entry-STRAT.tp*atrA[i]};
      }
    }
  }
  if(pos) close(n-1,cs[n-1].c,'END');
  return trades;
}

function stratStats(trades){
  const n=trades.length;
  const wins=trades.filter(t=>t.r>0), losses=trades.filter(t=>t.r<=0);
  const gw=wins.reduce((a,t)=>a+t.r,0), gl=Math.abs(losses.reduce((a,t)=>a+t.r,0));
  let cum=0,peak=0,dd=0; const curve=[0];
  trades.forEach(t=>{cum+=t.r; peak=Math.max(peak,cum); dd=Math.max(dd,peak-cum); curve.push(+cum.toFixed(3));});
  return {trades:n,wins:wins.length,losses:losses.length,
    win_rate:n?+(wins.length/n*100).toFixed(1):0,
    total_r:+cum.toFixed(2), avg_r:n?+(cum/n).toFixed(2):0,
    profit_factor:gl?+(gw/gl).toFixed(2):(gw?99:0),
    max_dd:+dd.toFixed(2),
    best:n?+Math.max(...trades.map(t=>t.r)).toFixed(2):0,
    worst:n?+Math.min(...trades.map(t=>t.r)).toFixed(2):0,
    avg_bars:n?+(trades.reduce((a,t)=>a+t.bars,0)/n).toFixed(1):0,
    curve};
}

async function loadHistory(symbol, tf){
  const key=symbol+':'+tf;
  if(HISTORY_CACHE[key]) return HISTORY_CACHE[key];
  let raw=null;
  try{ raw=await getJSON('data/history/'+symbol+'.json',25000); }catch(e){}
  const toC=arr=>arr.map(a=>({t:a[0],o:a[1],h:a[2],l:a[3],c:a[4]}));
  let cs=[], source='history';
  if(raw){
    if(tf==='H4' && raw.H1 && raw.H1.length) cs=resample(toC(raw.H1),4);
    else if(raw[tf]) cs=toC(raw[tf]);
  }
  if(cs.length<120){
    try{ cs=await fetchCandles(symbol,tf); source='live'; }catch(e){}
  }
  if(cs.length<120) throw new Error('مفيش بيانات تاريخية كفاية للأداة/الفريم ده. جرّب D1 أو أداة تانية.');
  const out={candles:cs,source,generated_at:(raw&&raw.generated_at)||null};
  HISTORY_CACHE[key]=out;
  return out;
}

function stratSignal(cs){
  const n=cs.length; if(n<60) return null;
  const {emaF,emaS,rsiA,atrA}=stratSeries(cs); const i=n-1;
  if(rsiA[i]===null||!atrA[i]) return null;
  const up=rsiA[i-1]<=50&&rsiA[i]>50;
  const dn=rsiA[i-1]>=50&&rsiA[i]<50;
  let bias='WAIT';
  if(up&&emaF[i]>emaS[i]) bias='BUY';
  else if(dn&&emaF[i]<emaS[i]) bias='SELL';
  const last=cs[i].c, a=atrA[i], entry=+last.toFixed(4);
  const sl=bias==='BUY'?+(entry-STRAT.sl*a).toFixed(4):bias==='SELL'?+(entry+STRAT.sl*a).toFixed(4):null;
  const tp=bias==='BUY'?+(entry+STRAT.tp*a).toFixed(4):bias==='SELL'?+(entry-STRAT.tp*a).toFixed(4):null;
  const trend=emaF[i]>emaS[i]?'صاعد':'هابط';
  const reasons=[
    `RSI14 = ${rsiA[i].toFixed(1)} (${rsiA[i]>50?'فوق 50':'تحت 50'})`,
    `EMA20 ${emaF[i]>emaS[i]?'فوق':'تحت'} EMA50 → اتجاه ${trend}`,
    `ATR14 = ${a.toFixed(4)} → الوقف ${STRAT.sl}×ATR والهدف ${STRAT.tp}×ATR`
  ];
  return {bias,entry,sl,tp,atr:+a.toFixed(4),rsi:+rsiA[i].toFixed(1),
    ema20:+emaF[i].toFixed(4),ema50:+emaS[i].toFixed(4),trend,reasons,last_t:cs[i].t,rr:STRAT.tp/STRAT.sl};
}

function equitySvg(curve){
  if(!curve||curve.length<2) return '<p class="note">مفيش بيانات كفاية.</p>';
  const w=600,h=140,pad=10;
  const min=Math.min(...curve,0), max=Math.max(...curve,0);
  const span=max-min||1;
  const x=i=>pad+i*(w-2*pad)/(curve.length-1);
  const y=v=>pad+(max-v)*(h-2*pad)/span;
  const pts=curve.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const zero=y(0).toFixed(1);
  return `<svg viewBox="0 0 ${w} ${h}" class="equity" preserveAspectRatio="none">
    <line x1="${pad}" y1="${zero}" x2="${w-pad}" y2="${zero}" stroke="#28313d" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="${curve[curve.length-1]>=0?'#43c77a':'#f2685e'}" stroke-width="2.5"/>
  </svg>`;
}

var LAST_STRAT=null;
function renderStrategy(symbol,tf,hist,trades,stats,signal){
  LAST_STRAT={symbol,tf,stats,signal};
  const s=stats;
  const quality=s.profit_factor>=1.5&&s.trades>=STRAT.minTrades?'جيدة':s.profit_factor>=STRAT.minPF&&s.trades>=STRAT.minTrades?'مقبولة':'ضعيفة';
  const weak=s.trades<STRAT.minTrades||s.profit_factor<STRAT.minPF;
  el('stratStats').innerHTML=[
    ['صفقات',s.trades],['نسبة النجاح',s.win_rate+'%'],['معامل الربح',s.profit_factor],
    ['إجمالي R',s.total_r],['أقصى تراجع',s.max_dd+'R'],['متوسط R',s.avg_r]
  ].map(([k,v])=>`<span class="chip">${esc(k)}: <b>${esc(v)}</b></span>`).join('');
  const b=signal;
  const badge=b?b.bias:'WAIT';
  el('stratSignal').innerHTML=`
    <div class="row"><span class="k">الإشارة الحالية</span><span class="badge ${badge==='BUY'?'buy':badge==='SELL'?'sell':'wait'}">${badge}</span></div>
    ${b&&b.bias!=='WAIT'?`
      <div class="row"><span class="k">الدخول</span><span class="v">${fmt(b.entry)}</span></div>
      <div class="row"><span class="k">الوقف</span><span class="v">${fmt(b.sl)}</span></div>
      <div class="row"><span class="k">الهدف</span><span class="v">${fmt(b.tp)}</span></div>
      <div class="row"><span class="k">العائد/المخاطرة</span><span class="v">1:${b.rr}</span></div>`:''}
    <div class="row"><span class="k">جودة الاختبار</span><span class="v">${quality} (PF ${s.profit_factor})</span></div>
    <ul>${(b?b.reasons:[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
    ${weak?'<p class="err">تحذير: عدد الصفقات أو معامل الربح ضعيف على الأداة/الفريم ده — الأفضل متتداولش عليه.</p>':''}
    <p class="note">${b&&b.bias==='WAIT'?'مفيش تقاطع جديد دلوقتي — الاستراتيجية بتستنى إشارة واضحة ومبتدخلش في نص الحركة.':'الإشارة دي قواعد ثابتة، مش رأي AI.'}</p>`;
  el('equityChart').innerHTML=equitySvg(s.curve);
  el('stratTrades').innerHTML=trades.slice(-6).reverse().map(t=>`
    <div class="provider"><b class="${t.r>0?'pos':'neg'}">${t.r>0?'+':''}${t.r}R</b> · ${t.side==='BUY'?'شراء':'بيع'} · ${t.reason}
      <div class="tiny">دخول ${t.entry} · خروج ${t.exit} · ${t.bars} شمعة</div></div>`).join('')||'<p class="note">مفيش صفقات كفاية.</p>';
  el('stratMsg').textContent=`${symbol} · ${tf} · ${hist.candles.length} شمعة (${hist.source==='history'?'بيانات محفوظة':'بيانات لحظية'}) — ${s.trades} صفقة تاريخية.`;
  calcRisk();
}

async function runStrategy(){
  const btn=el('stratBtn'); if(btn.disabled) return;
  const symbol=el('stratSymbol').value, tf=el('stratTf').value;
  btn.disabled=true; btn.textContent='جاري الاختبار...';
  el('stratMsg').textContent='بجيب البيانات وأشغّل الباكتيست...';
  try{
    const hist=await loadHistory(symbol,tf);
    const trades=backtest(hist.candles);
    if(trades.length<5) throw new Error('الصفقات التاريخية قليلة جداً على الفريم ده — جرّب D1.');
    const stats=stratStats(trades);
    const signal=stratSignal(hist.candles);
    renderStrategy(symbol,tf,hist,trades,stats,signal);
  }catch(e){ el('stratMsg').textContent='خطأ: '+e.message; }
  finally{ btn.disabled=false; btn.textContent='شغّل الاستراتيجية'; }
}

const CONTRACT={
  XAUUSD:{unit:'لوت',perPoint:100,note:'1 لوت = 100 أونصة'},
  XAGUSD:{unit:'لوت',perPoint:5000,note:'1 لوت = 5000 أونصة'},
  EURUSD:{unit:'لوت',perPoint:100000,pip:0.0001,pipValue:10,note:'1 لوت = 100,000 يورو'},
  GBPUSD:{unit:'لوت',perPoint:100000,pip:0.0001,pipValue:10,note:'1 لوت = 100,000 جنيه'},
  USDJPY:{unit:'لوت',perPoint:100000,pip:0.01,note:'قيمة النقطة بتتغير مع السعر'},
  BTCUSD:{unit:'وحدة',perPoint:1,note:'حسب بروكرك'},
  ETHUSD:{unit:'وحدة',perPoint:1,note:'حسب بروكرك'},
  US500:{unit:'عقد',perPoint:1,note:'1 عقد ≈ $1 للنقطة'},
  US30:{unit:'عقد',perPoint:1,note:'1 عقد ≈ $1 للنقطة'},
  NAS100:{unit:'عقد',perPoint:1,note:'1 عقد ≈ $1 للنقطة'},
  VIX:{unit:'عقد',perPoint:1,note:'تقديري'},
  DXY:{unit:'عقد',perPoint:1,note:'تقديري'},
  US10Y:{unit:'عقد',perPoint:1,note:'تقديري'},
  WTI:{unit:'عقد',perPoint:1,note:'1 عقد = 1000 برميل تقريباً'}
};
function calcRisk(){
  const out=el('riskOut'); if(!out) return;
  const st=LAST_STRAT;
  if(!st||!st.signal||st.signal.bias==='WAIT'){ out.textContent='شغّل الاستراتيجية الأول عشان تطلع إشارة، وبعدين احسب الحجم.'; return; }
  const acct=Number(el('acctSize').value)||0;
  const pct=Number(el('riskPct').value)||0;
  if(acct<=0||pct<=0){ out.textContent='اكتب رأس المال ونسبة المخاطرة (أكبر من صفر).'; return; }
  const sig=st.signal, dist=Math.abs(sig.entry-sig.sl);
  const spec=CONTRACT[st.symbol]||{unit:'وحدة',perPoint:1,note:'تقديري'};
  const riskAmt=acct*pct/100;
  let size, formula;
  if(spec.pip){
    const pips=dist/spec.pip;
    const pipVal=spec.pipValue||(1000/sig.entry);
    size=riskAmt/(pips*pipVal);
    formula=`${pips.toFixed(1)} نقطة × $${pipVal.toFixed(2)} للنقطة`;
  }else{
    size=riskAmt/(dist*spec.perPoint);
    formula=`${dist.toFixed(4)} حركة × $${spec.perPoint} للنقطة`;
  }
  const dec=size<0.01?4:2;
  out.innerHTML=`المخاطرة: <b>$${riskAmt.toFixed(2)}</b> · مسافة الوقف: <b>${dist.toFixed(4)}</b><br>
    الحجم المقترح: <b>${size.toFixed(dec)} ${spec.unit}</b> (${formula})<br>
    ${spec.unit==='لوت'&&size<0.01?'<span class="err">الحجم أقل من 0.01 لوت — قلل نسبة المخاطرة أو زود رأس المال أو استخدم حساب ميكرو.</span><br>':''}
    <span class="tiny">${spec.note} — تقديري، راجع بروكرك.</span>`;
}

async function fetchNews(query, limit){
  const cacheKey='n:'+query; const hit=cacheGet(cacheKey); if(hit) return hit;
  let items=[];
  try{
    const rss=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const d = await getJSON('https://api.rss2json.com/v1/api.json?rss_url='+encodeURIComponent(rss),10000);
    items=(d.items||[]).slice(0,limit).map(x=>({title:(x.title||'').slice(0,220),link:x.link||'',published:x.pubDate||'',source:x.source||''}));
  }catch(e){
    try{
      const rss=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const xml=await fetchViaProxies(rss,'text',10000);
      const doc=new DOMParser().parseFromString(xml,'text/xml');
      items=[...doc.querySelectorAll('item')].slice(0,limit).map(x=>({title:(x.querySelector('title')?.textContent||'').slice(0,220),link:x.querySelector('link')?.textContent||'',published:x.querySelector('pubDate')?.textContent||'',source:x.querySelector('source')?.textContent||''}));
    }catch(e2){}
  }
  if(items.length) cacheSet(cacheKey,items);
  return items;
}
async function fetchMacro(){
  const out=[];
  await Promise.all(MACRO.map(async sym=>{
    try{ const cs=await fetchCandles(sym,'D1'); const i=indicators(cs); if(i.last) out.push({symbol:sym,label:SYMBOLS[sym].label,price:i.last,change_pct:i.change_pct,trend:i.trend}); }catch(e){}
  }));
  return out;
}
async function staticSnapshot(symbol, interval){
  try{
    const d=await getJSON('data/market.json',15000);
    const s=(d.symbols||{})[symbol];
    if(!s) return null;
    return {symbol,label:SYMBOLS[symbol].label,interval:s.interval||interval,generated_at:d.generated_at,
      indicators:s.indicators||{},recent_candles:s.recent_candles||[],macro:d.macro||[],news:s.news||[],
      warnings:['بيانات من النسخة المرفوعة على GitHub']};
  }catch(e){ return null; }
}
async function marketSnapshot(symbol, interval){
  const st=await staticSnapshot(symbol,interval);
  const stBars=st&&st.indicators&&Number(st.indicators.bars)||0;
  const stAge=st&&isFinite(Date.parse(st.generated_at))?Date.now()-Date.parse(st.generated_at):Infinity;
  // Fast path: freshly committed snapshot.
  if(st && stBars>=30 && stAge < 20*60*1000) return st;
  const warnings=[];
  let cs=[]; try{ cs=await fetchCandles(symbol,interval); }catch(e){ warnings.push('price error'); }
  if(!cs.length) warnings.push('no price data');
  const news=[...await fetchNews(SYMBOLS[symbol].query,8), ...await fetchNews('financial markets economy central banks',6)];
  const seen=new Set(), merged=[];
  for(const n of news){ if(n.title && !seen.has(n.title)){ seen.add(n.title); merged.push(n); } if(merged.length>=12) break; }
  // Refreshing macro through free proxies is slow — reuse the committed snapshot when present.
  const macro=(st&&st.macro&&st.macro.length>=2)?st.macro:await fetchMacro();
  const snap={symbol,label:SYMBOLS[symbol].label,interval,generated_at:new Date().toISOString().slice(0,19),
    indicators:indicators(cs),recent_candles:cs.slice(-16).map(c=>({t:new Date(c.t*1000).toISOString().slice(0,16).replace('T',' '),o:+c.o.toFixed(4),h:+c.h.toFixed(4),l:+c.l.toFixed(4),c:+c.c.toFixed(4)})),
    macro, news:merged, warnings};
  if(st){
    // Never replace a full dataset with a 1-candle live fallback.
    if(cs.length<30){ snap.indicators=st.indicators; snap.recent_candles=st.recent_candles; snap.generated_at=st.generated_at; warnings.push('بيانات من النسخة الاحتياطية على GitHub'); }
    if(!snap.news.length) snap.news=st.news;
    if(snap.macro.length<2) snap.macro=st.macro;
  }
  return snap;
}

/* ---------- rendering ---------- */
function renderIndicators(ind){
  const labels={last:'السعر',change_pct:'تغير %',ema20:'EMA20',ema50:'EMA50',sma200:'SMA200',rsi14:'RSI14',atr14:'ATR14',atr_pct:'ATR %',bb_upper:'BB upper',bb_lower:'BB lower',stoch_k:'Stoch',high20:'قمة 20',low20:'قاع 20',trend:'الاتجاه',bars:'شموع'};
  return Object.entries(labels).filter(([k])=>ind[k]!==null&&ind[k]!==undefined).map(([k,l])=>`<span class="chip">${esc(l)}: <b>${esc(ind[k])}</b></span>`).join('');
}
function renderMarket(m){
  if(!m) return '';
  return `<p class="tiny">${esc(m.label||m.symbol)} · ${esc(m.interval)} · ${esc(m.generated_at)}</p>
  <div class="chips">${renderIndicators(m.indicators||{})}</div>
  <h3>السوق الماكرو</h3><div class="chips">${(m.macro||[]).map(x=>`<span class="chip">${esc(x.label||x.symbol)}: <b>${fmt(x.price)}</b> (${fmt(x.change_pct)}%)</span>`).join('')}</div>
  <h3>الأخبار</h3><ul>${(m.news||[]).slice(0,8).map(n=>`<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a></li>`).join('')}</ul>
  ${(m.warnings||[]).length?`<p class="note">${esc(m.warnings.join(' · '))}</p>`:''}`;
}
async function preview(){
  err(''); el('loading').style.display='block';
  try{
    const s=await marketSnapshot(el('symbol').value, el('interval').value);
    el('snapshot').style.display='block';
    el('snapInfo').innerHTML=`<p class="tiny">${esc(s.label)} · ${esc(s.interval)} · ${esc(s.generated_at)} · ${(s.recent_candles||[]).length} شمعة</p>`;
    el('snapInd').innerHTML=renderIndicators(s.indicators||{});
    el('snapMacro').innerHTML=(s.macro||[]).map(x=>`<span class="chip">${esc(x.label||x.symbol)}: <b>${fmt(x.price)}</b> (${fmt(x.change_pct)}%)</span>`).join('');
    el('snapNews').innerHTML=(s.news||[]).map(n=>`<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a></li>`).join('');
  }catch(e){ err('فشل سحب البيانات: '+e.message); }
  finally{ el('loading').style.display='none'; }
}

/* ---------- AI ---------- */
function parseJSON(text){
  try{ return JSON.parse(text); }catch(e){}
  const s=(text||'').indexOf('{'), e=(text||'').lastIndexOf('}');
  if(s>=0&&e>s){ try{ return JSON.parse(text.slice(s,e+1)); }catch(e2){} }
  return {};
}
function redact(msg,key){ let s=String(msg); if(key) s=s.split(key).join('[redacted]'); return s.slice(0,400); }
async function callModel(p, messages){
  const started=Date.now();
  const out={name:p.name,model:p.model,ok:false,text:'',error:null,latency_ms:0};
  const payload={model:p.model,messages,temperature:0.15,response_format:{type:'json_object'}};
  try{
    let r=await fetch(p.base_url.replace(/\/$/,'')+'/chat/completions',{method:'POST',
      headers:{'Authorization':'Bearer '+p.api_key,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok){
      if(r.status===400||r.status===422){ delete payload.response_format; r=await fetch(p.base_url.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+p.api_key,'Content-Type':'application/json'},body:JSON.stringify(payload)}); }
      if(!r.ok) throw new Error('HTTP '+r.status);
    }
    const d=await r.json();
    out.text=((d.choices||[])[0]||{}).message?.content||'';
    out.ok=!!out.text;
  }catch(e){ out.error=redact(e.message,p.api_key); }
  out.latency_ms=Date.now()-started;
  return out;
}
function median(vals){
  const nums=vals.map(Number).filter(x=>isFinite(x)).sort((a,b)=>a-b);
  if(!nums.length) return null;
  const m=Math.floor(nums.length/2);
  return nums.length%2?nums[m]:(nums[m-1]+nums[m])/2;
}
function aggregate(results, snap){
  const parsed=[];
  results.forEach(r=>{ if(r.ok){ const o=parseJSON(r.text); if(o&&o.bias) parsed.push({...o,_meta:r}); } });
  const market={symbol:snap.symbol,label:snap.label,interval:snap.interval,generated_at:snap.generated_at,indicators:snap.indicators,macro:snap.macro,news:snap.news,warnings:snap.warnings};
  const rows=results.map(r=>{ const p=parsed.find(x=>x._meta.name===r.name); return {name:r.name,model:r.model,bias:p?String(p.bias).toUpperCase():'-',confidence:p?.confidence??null,latency_ms:r.latency_ms,ok:r.ok,error:r.error}; });
  if(!parsed.length) return {error:'كل المفاتيح فشلت. راجع المفاتيح والموديلات والـ Base URL.',market,providers:rows,execution:'ANALYSIS ONLY'};
  const votes={}; parsed.forEach(o=>{const b=String(o.bias).toUpperCase(); votes[b]=(votes[b]||0)+1;});
  const ranked=Object.entries(votes).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  let winner=ranked[0][0]; if(!['BUY','SELL','WAIT'].includes(winner)) winner='WAIT';
  if(['BUY','SELL'].includes(winner)&&ranked.length>1&&ranked[0][1]===ranked[1][1]) winner='WAIT';
  const pool=parsed.filter(o=>String(o.bias).toUpperCase()===winner); const use=pool.length?pool:parsed;
  const pick=(key,i)=>median(use.map(o=>Array.isArray(o[key])?o[key][i]:null));
  const zone=[pick('entry_zone',0),pick('entry_zone',1)], sl=median(use.map(o=>o.stop_loss));
  const tps=[0,1,2].map(i=>pick('take_profit',i)).filter(x=>x!==null);
  let rr=median(use.map(o=>o.risk_reward));
  if(rr===null&&sl!==null&&zone[0]!==null&&tps.length){ const risk=Math.abs(zone[0]-sl); if(risk) rr=+(Math.abs(tps[0]-zone[0])/risk).toFixed(2); }
  let conf=median(use.map(o=>o.confidence)); conf=conf===null?0:Math.max(0,Math.min(100,Math.round(conf)));
  const factors=[]; parsed.forEach(o=>(o.key_factors||[]).forEach(f=>{const t=String(f).trim(); if(t&&!factors.includes(t)) factors.push(t);}));
  const best=parsed.reduce((a,b)=>(+b.confidence||0)>(+a.confidence||0)?b:a,parsed[0]);
  const txt=(o,k)=>o?.[k]?String(o[k]):'-';
  return {symbol:snap.symbol,label:snap.label,interval:snap.interval,bias:winner,confidence:conf,
    thesis:txt(pool[0]||best,'thesis'),key_factors:factors.slice(0,8),news_impact:txt(best,'news_impact'),
    entry_zone:zone,stop_loss:sl,take_profit:tps,risk_reward:rr,invalidation:txt(best,'invalidation'),
    wait_conditions:txt(best,'wait_conditions'),time_horizon:txt(best,'time_horizon'),risk_note:txt(best,'risk_note'),
    market,generated_at:new Date().toISOString().slice(0,19),engine:'all enabled AI models in parallel — consensus',
    consensus:{providers_ok:parsed.length,providers_total:results.length,agreement:+(parsed.length?pool.length/parsed.length:0).toFixed(2),votes},
    providers:rows,execution:'ANALYSIS ONLY - no order was placed'};
}
function renderResult(r){
  el('result').style.display='block';
  if(r.error){ err(r.error); return; }
  const b=el('bias'); b.textContent=r.bias; b.className='badge '+(r.bias==='BUY'?'buy':r.bias==='SELL'?'sell':'wait');
  el('confBar').style.width=(r.confidence||0)+'%'; el('confText').textContent=(r.confidence||0)+'%';
  el('inst').textContent=`${r.symbol||'-'} / ${r.interval||'-'}`;
  el('entry').textContent=(r.entry_zone||[]).map(fmt).join(' - '); el('sl').textContent=fmt(r.stop_loss);
  el('tp').textContent=(r.take_profit||[]).map(fmt).join(' / ')||'-'; el('rr').textContent=fmt(r.risk_reward);
  el('inv').textContent=r.invalidation||'-'; el('wait').textContent=r.wait_conditions||'-';
  const c=r.consensus||{}; el('agree').textContent=`${c.providers_ok||0}/${c.providers_total||0} · توافق ${Math.round((c.agreement||0)*100)}%`;
  el('thesis').textContent=r.thesis||''; el('factors').innerHTML=(r.key_factors||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  el('newsImpact').textContent=r.news_impact||'-'; el('risk').textContent=r.risk_note||'-';
  el('providersResult').innerHTML=(r.providers||[]).map(p=>`<div class="provider"><b>${esc(p.name)}</b> <span class="tiny">${esc(p.model)}</span><div class="tiny">${esc(p.bias)} · ${fmt(p.confidence)}% · ${p.latency_ms||0}ms ${p.ok?'':'· فشل'}</div>${p.error?`<div class="tiny err">${esc(p.error)}</div>`:''}</div>`).join('');
  el('resultMarket').innerHTML=renderMarket(r.market);
  el('stamp').textContent=(r.generated_at||'')+' — '+(r.execution||'');
}
async function analyze(){
  if(el('runBtn').disabled) return;
  err(''); el('runBtn').disabled=true; el('runBtn').textContent='جاري التحليل...'; el('loading').style.display='block';
  try{
    const snap=await marketSnapshot(el('symbol').value,el('interval').value);
    el('snapshot').style.display='block';
    el('snapInfo').innerHTML=`<p class="tiny">${esc(snap.label)} · ${esc(snap.interval)} · ${esc(snap.generated_at)}</p>`;
    el('snapInd').innerHTML=renderIndicators(snap.indicators||{});
    const active=providers().filter(p=>p.api_key&&p.enabled&&p.base_url&&p.model).slice(0,MAX_MODELS);
    if(!active.length){ err('مفيش مفاتيح مفعّلة. اضغط «إعداد مفاتيح AI» وأضف مفاتيحك.'); return; }
    const messages=[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify({instrument:snap.symbol,timeframe:snap.interval,indicators:snap.indicators,recent_candles:snap.recent_candles,macro_market:snap.macro,news:snap.news,data_warnings:snap.warnings})}];
    const results=await Promise.all(active.map(p=>callModel(p,messages)));
    renderResult(aggregate(results,snap));
  }catch(e){ err('خطأ: '+e.message); }
  finally{ el('loading').style.display='none'; el('runBtn').disabled=false; el('runBtn').textContent='اسأل النماذج (اختياري)'; }
}
function init(){
  const options=Object.entries(SYMBOLS).map(([k,v])=>`<option value="${k}">${esc(v.label)} (${esc(v.kind)})</option>`).join('');
  const sel=el('symbol'); if(sel){ sel.innerHTML=options; sel.value='XAUUSD'; }
  const ssel=el('stratSymbol'); if(ssel){ ssel.innerHTML=options; ssel.value='XAUUSD'; }
  renderProviders();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
}
init();
