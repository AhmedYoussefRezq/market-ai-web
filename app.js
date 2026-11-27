/* Market AI — static GitHub Pages app. Keys stay in this browser only. */

const LS_KEY = 'market-ai-providers-v1';
const CACHE_KEY = 'market-ai-cache-v1';
const MAX_MODELS = 20;

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
  {name:'groq', base_url:'https://api.groq.com/openai/v1', model:'llama-3.3-70b-versatile', api_key:'', enabled:true},
  {name:'openrouter', base_url:'https://openrouter.ai/api/v1', model:'meta-llama/llama-3.3-70b-instruct:free', api_key:'', enabled:true},
  {name:'gemini', base_url:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-2.0-flash', api_key:'', enabled:true},
  {name:'mistral', base_url:'https://api.mistral.ai/v1', model:'mistral-small-latest', api_key:'', enabled:true},
  {name:'cerebras', base_url:'https://api.cerebras.ai/v1', model:'llama-3.3-70b', api_key:'', enabled:true},
  {name:'openai', base_url:'https://api.openai.com/v1', model:'gpt-4o-mini', api_key:'', enabled:true},
  {name:'custom', base_url:'', model:'', api_key:'', enabled:true}
];

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
function err(msg){ el('err').textContent = msg || ''; }

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
function saveProviders(list){ localStorage.setItem(LS_KEY, JSON.stringify(list)); }
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
  el('keyCount').textContent = list.filter(p=>p.api_key).length;
  el('providerList').innerHTML = list.length ? list.map(p=>`
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
  finally{ el('loading').style.display='none'; el('runBtn').disabled=false; el('runBtn').textContent='شغّل التحليل بكل المفاتيح'; }
}
function init(){
  const sel=el('symbol');
  sel.innerHTML=Object.entries(SYMBOLS).map(([k,v])=>`<option value="${k}">${esc(v.label)} (${esc(v.kind)})</option>`).join('');
  sel.value='XAUUSD'; renderProviders();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
}
init();
