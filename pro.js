/* Market AI Pro — chat-first trading analyst.
   Static app: free public data + keys kept in this browser. ANALYSIS ONLY. */

const PRO_CHAT_KEY = 'market-ai-pro-chat-v2';
const PRO_PREF_KEY = 'market-ai-pro-prefs-v1';
const PRO_REC_KEY = 'market-ai-pro-rec-v1';
const PRO_SYSTEM = `أنت «Market AI Pro»، مساعد تحليل سوق. قواعدك:
1) استخدم فقط البيانات المرفقة (JSON). لا تخترع أسعاراً أو أخباراً أو أرقاماً.
2) أجب بالعربية، مختصراً وواضحاً: 4-6 نقاط كحد أقصى، كل نقطة جملة واحدة.
3) فرّق بين: (أ) بيانات السوق، (ب) رأي AI.
4) لا وعود ربح، ولا توصية نهائية بالشراء/البيع. ذكّر بالمخاطرة.
5) لو طلب تنفيذ صفقة، اعتذر: التطبيق للتحليل فقط.
6) لا تقل «متأكد/مضمون». استخدم «البيانات تشير إلى...».
7) إذا كانت البيانات قديمة/بها تحذيرات، اذكر ذلك أولاً.
8) لو فيه web_search في السياق، ده بحث حقيقي في الإنترنت: اعتمد عليه للأخبار الحديثة، واذكر عنوان الخبر وتاريخه عند الاستناد له، ولو نتايجه فاضية قول إن مفيش أخبار حديثة متاحة. متخترعش أخبار مش موجودة فيه.
9) الأخبار: المصدر الوحيد المسموح للبناء عليه هو web_search (بحث لحظي). أي شيء في archived_news أرشيف محفوظ بتاريخه — ذكره للسياق فقط، وممنوع تبني عليه توصية أو تقدّمه كخبر حديث. لو web_search فاضي، قول صراحة إن مفيش أخبار لحظية متاحة.
10) لو quality_gate.pass=false، ممنوع تعطي BUY أو SELL: لازم WAIT أو شرح فقط، واذكر سبب الرفض (معامل الربح PF وعدد الصفقات المطلوب). التطبيق بيرفض أي رد فيه BUY/SELL على إعداد مرفوض.`;

const PRO_PROMPTS = [
  'حلّل الأداة الحالية وأعطني توصية',
  'إيه رأيك في الإشارة الحالية؟',
  'احسب حجم اللوت بـ 1% مخاطرة'
];

var PRO_CTX = null;
var PRO_CTX_AT = 0;
var PRO_BUSY = false;

function proEl(id){ return document.getElementById(id); }
var PRO_LIVE_CHART=null;
var PRO_CANDLES=null, PRO_CANDLES_TF=null;
var GATE_CACHE={key:'',at:0,data:null};
function proPrefs(){
  try{ return JSON.parse(localStorage.getItem(PRO_PREF_KEY)||'{}'); }catch(e){ return {}; }
}
function proSavePrefs(p){ try{ localStorage.setItem(PRO_PREF_KEY,JSON.stringify(p)); }catch(e){} }
function proChat(){
  try{ const a=JSON.parse(localStorage.getItem(PRO_CHAT_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; }
}
function proSaveChat(a){
  try{ localStorage.setItem(PRO_CHAT_KEY,JSON.stringify(a.slice(-60))); }catch(e){}
}
function proTime(){ return new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}); }
function proMd(t){
  let s=esc(t||'');
  s=s.replace(/```([\s\S]*?)```/g,(_,c)=>'<pre><code>'+c.trim()+'</code></pre>');
  s=s.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  s=s.replace(/^#{1,3}\s+(.+)$/gm,'<h4>$1</h4>');
  s=s.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
  s=s.replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<i>$2</i>');
  s=s.replace(/^\s*[-*•]\s+(.+)$/gm,'<li>$1</li>');
  s=s.replace(/^\s*(\d+)\.\s+(.+)$/gm,'<b>$1.</b> $2');
  return s.replace(/\n/g,'<br>');
}
function proPush(role,text,meta){
  const m={id:String(Date.now())+Math.random().toString(36).slice(2,7),role,text,meta:meta||{},at:proTime()};
  const all=proChat(); all.push(m); proSaveChat(all); proRenderChat(); return m.id;
}
function proFind(id){ return proEl('chat')?.querySelector('[data-id="'+id+'"]'); }
function proUpdate(id,text,meta){
  const node=proFind(id); if(!node) return;
  const body=node.querySelector('.body'); if(body) body.innerHTML=proMd(text);
  const who=node.querySelector('.who'); if(who&&meta){
    who.innerHTML='<b>'+esc(meta.model||'AI')+'</b>'+(meta.ms?'<span>· '+meta.ms+'ms</span>':'')+'<span>· '+esc(meta.at||'')+'</span>';
  }
  const all=proChat(); const m=all.find(x=>x.id===id);
  if(m){ m.text=text; if(meta) m.meta=meta; proSaveChat(all); }
}
function proRenderChat(){
  const box=proEl('chat'); if(!box) return;
  const all=proChat();
  const aiAv='<span class="mark">AI</span>';
  const meAv='';
  if(!all.length){
    box.innerHTML='';
  }else{
    box.innerHTML=all.map(m=>{
      const meta=m.meta||{};
      return '<div class="msg '+m.role+'" data-id="'+esc(m.id)+'">'+
        (m.role==='bot'?aiAv:meAv)+
        '<div class="bubble">'+
        (m.role==='bot'?'<div class="who"><b>'+esc(meta.model||'AI')+'</b>'+(meta.ms?'<span>· '+meta.ms+'ms</span>':'')+'<span>· '+esc(m.at||'')+'</span></div>':'<div class="who">'+esc(m.at||'')+'</div>')+
        '<div class="body">'+proMd(m.text)+'</div>'+
        (m.role==='bot'?'<div class="foot"><button onclick="proCopy(\''+esc(m.id)+'\')"><svg class="ico"><use href="#i-copy"/></svg> نسخ</button></div>':'')+
        '</div></div>';
    }).join('');
  }
  const meta=proEl('chatMeta'); if(meta) meta.textContent=all.length+' رسالة محفوظة في هذا المتصفح';
  box.scrollTop=box.scrollHeight;
}
function proCopy(id){
  const m=proChat().find(x=>x.id===id); if(!m) return;
  navigator.clipboard?.writeText(m.text).then(()=>err('اتنسخ الرد.')).catch(()=>err('مش قادر أنسخ — اختار النص واعمل نسخ يدوي.'));
}
function clearChat(){
  if(!confirm('مسح كل المحادثة المحفوظة؟')) return;
  proSaveChat([]); proRenderChat(); err('');
}
function exportChat(){
  const all=proChat(); if(!all.length){ err('مفيش محادثة لتصديرها.'); return; }
  const txt=all.map(m=>`[${m.at}] ${m.role==='user'?'أنت':((m.meta||{}).model||'AI')}\n${m.text}\n`).join('\n---\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain;charset=utf-8'}));
  a.download='market-ai-pro-chat.txt'; a.click(); URL.revokeObjectURL(a.href);
}
function toggleProSettings(evt){
  const ov=proEl('settingsOverlay'); if(!ov) return;
  if(evt && evt.target!==ov) return;
  const show=ov.style.display!=='flex';
  ov.style.display=show?'flex':'none';
  document.body.classList.toggle('modal-open',show);
}
function proConnect(){
  const ov=proEl('settingsOverlay');
  if(ov){ ov.style.display='flex'; document.body.classList.add('modal-open'); }
  const k=proEl('groqKey'); if(k) setTimeout(()=>k.focus(),250);
  err('الصق مفتاح AI مجاني واضغط الزر — المفاتيح بتتخزن في متصفحك بس.');
}
function proQuickProvider(source){
  const ids={groq:'groqKey',cerebras:'cerebrasKey',gemini:'geminiKey',
    huggingface:'hfKey',mistral:'mistralKey'}, set=FREE_MODEL_SETS[source];
  if(!set) return;
  const input=proEl(ids[source]), key=(input?.value||'').trim();
  if(!key){ err('الصق المفتاح الأول من '+set.label); return; }
  addTemplates();
  const list=providers(), owner=list.find(p=>p.name.toLowerCase()===source);
  if(!owner) list.push({name:source,base_url:set.base,model:set.models[0],api_key:key,enabled:true});
  else owner.api_key=key;
  if(!saveProviders(list)) return;
  addFreeModels(source);
  if(input) input.value='';
  proFillModels(); renderProviders();
  const n=providers().filter(p=>p.api_key&&p.enabled&&p.base_url&&p.model).length;
  err(`تم ✅ ${set.label} — ${n} موديل جاهز.`);
}
function proUseLocalBridge(){
  const list=providers(), base='http://localhost:8767/v1', model='openai/gpt-oss-120b';
  const found=list.find(p=>p.base_url===base&&p.model===model);
  if(found) found.enabled=true;
  else list.push({name:'groq-local',base_url:base,model,api_key:'local',enabled:true});
  saveProviders(list); renderProviders(); proFillModels();
  err('اتضاف موديل Groq المحلي. لو الجسر شغال (`python scripts/local_ai_bridge.py`) اسأل دلوقتي — المفتاح مش موجود في المتصفح.');
}
function proKeyAction(action){
  if(action==='templates') addTemplates();
  else if(action==='groq') addFreeModels('groq');
  else if(action==='cerebras') addFreeModels('cerebras');
  else if(action==='status') showSaveStatus();
  proFillModels();
}
function proFillModels(){
  const sel=proEl('proModel'); if(!sel) return;
  const list=providers().filter(p=>p.api_key&&p.enabled&&p.base_url&&p.model);
  sel.innerHTML=list.length?list.map((p,i)=>`<option value="${i}">${esc(p.name)} — ${esc(p.model)}</option>`).join('')
    :'<option value="">مفيش موديلات — افتح «مفاتيح AI»</option>';
  const prefs=proPrefs();
  if(prefs.model!==undefined && +prefs.model<list.length) sel.value=String(prefs.model);
}
function proFailKey(p){ return 'market-ai-fail-'+p.base_url+'|'+p.model; }
function markProviderFail(p,minutes){
  try{ localStorage.setItem(proFailKey(p),String(Date.now()+(minutes||10)*60000)); }catch(e){}
}
function markProviderOK(p){ try{ localStorage.removeItem(proFailKey(p)); }catch(e){} }
function proEnabledModels(){ return providers().filter(p=>p.api_key&&p.enabled&&p.base_url&&p.model); }
function proSortedModels(){
  const now=Date.now();
  return proEnabledModels().slice().sort((a,b)=>{
    let ta=0,tb=0;
    try{ ta=Number(localStorage.getItem(proFailKey(a))||0); tb=Number(localStorage.getItem(proFailKey(b))||0); }catch(e){}
    return (ta>now?1:0)-(tb>now?1:0);
  });
}
function proActiveModels(){
  // The dropdown is built from the stored order — keep that index intact.
  // Failure-based reordering applies only to harmony and to failover fallbacks.
  const all=proEnabledModels(), sel=proEl('proModel');
  if(proEl('proHarmony')?.checked) return proSortedModels().slice(0,4);
  const i=sel?Number(sel.value||0):0;
  return all[i]?[all[i]]:(all[0]?[all[0]]:[]);
}

/* ---------- grounded context ---------- */
function withTimeout(p,ms,fallback){
  return Promise.race([p,new Promise(r=>setTimeout(()=>r(fallback),ms))]);
}
async function quickPrice(symbol){
  if(symbol==='XAUUSD'||symbol==='XAGUSD'){
    try{
      const d=await getJSON('https://api.gold-api.com/price/'+(symbol==='XAUUSD'?'XAU':'XAG'),3500);
      const p=Number(d.price); return isFinite(p)?p:null;
    }catch(e){ return null; }
  }
  if(symbol==='BTCUSD'||symbol==='ETHUSD'){
    try{
      const pair=symbol==='BTCUSD'?'BTCUSDT':'ETHUSDT';
      const d=await getJSON('https://api.binance.com/api/v3/ticker/price?symbol='+pair,3500);
      const p=Number(d.price); return isFinite(p)?p:null;
    }catch(e){ return null; }
  }
  return null;
}
async function buildProContext(withBasics=true){
  const symbol=proEl('proSymbol')?.value||'XAUUSD';
  const interval=proEl('proInterval')?.value||'H1';
  const ctx={generated_at:new Date().toISOString().slice(0,19),instrument:symbol,timeframe:interval,mode:'ANALYSIS ONLY'};
  let livePrice=null;
  if(symbol!=='XAUUSD'){
    try{ livePrice=await withTimeout(quickPrice(symbol),4000,null); }catch(e){}
  }
  let snap=null;
  // Gold runs on the live path first: real candles + live spot, indicators computed here.
  if(symbol==='XAUUSD'){
    try{ snap=await withTimeout(liveGoldSnapshot(interval),9000,null); }catch(e){}
  }
  if(!snap){
    try{ snap=await withTimeout(staticSnapshot(symbol,interval),4000,null); }catch(e){}
    if(!snap||!((snap.indicators||{}).last)){
      try{ snap=await withTimeout(marketSnapshot(symbol,interval),9000,null); }catch(e){}
    }
  }
  // Saved news is only ever passed as a dated archive — never as fresh news.
  let archived=null, archivedAt=null;
  if(snap && snap.live){
    if(withBasics){
      const base=await withTimeout(staticSnapshot(symbol,interval),3000,null);
      if(base){
        if((!snap.macro||!snap.macro.length) && base.macro && base.macro.length) snap.macro=base.macro;
        if(base.news && base.news.length){ archived=base.news; archivedAt=base.generated_at; }
      }
    }else if(PRO_CTX){
      snap.macro=(PRO_CTX.market&&PRO_CTX.market.macro)||[];
      if(PRO_CTX.archived_news) ctx.archived_news=PRO_CTX.archived_news;
    }
    PRO_CANDLES=(snap.candles && snap.candles.length>=120) ? snap.candles : null;
    PRO_CANDLES_TF=snap.interval||interval;
  }
  PRO_LIVE_CHART = (snap && snap.live && snap.chart && snap.chart.length>=20) ? snap.chart : null;
  if(snap&&((snap.indicators||{}).last||livePrice!==null)){
    const i=snap.indicators||{}, warnings=[...(snap.warnings||[])];
    const age=snap.generated_at&&isFinite(Date.parse(snap.generated_at))?Date.now()-Date.parse(snap.generated_at):Infinity;
    if(!snap.live){
      if(age>24*3600*1000) warnings.push('بيانات المؤشرات من نسخة GitHub (قد تكون قديمة) — استخدم السعر اللحظي.');
      if(livePrice!==null) warnings.push('سعر لحظي: '+livePrice);
    }
    ctx.market={label:snap.label||SYMBOLS[symbol]?.label,source_snapshot:snap.generated_at,
      source:snap.live?'live':'snapshot',basis_pct:snap.basis_pct??null,
      as_of:snap.as_of||snap.generated_at||null,
      price:snap.live?i.last:(livePrice!==null?livePrice:i.last),last:snap.live?i.last:(livePrice!==null?livePrice:i.last),
      snapshot_price:i.last,change_pct:i.change_pct,
      ema20:i.ema20,ema50:i.ema50,sma200:i.sma200,rsi14:i.rsi14,atr14:i.atr14,atr_pct:i.atr_pct,
      trend:i.trend,high20:i.high20,low20:i.low20,bars:i.bars,
      recent_candles:(snap.recent_candles||[]).slice(-8),
      macro:(snap.macro||[]).map(x=>({symbol:x.symbol,label:x.label,price:x.price,
        change_pct:x.change_pct,as_of:x.as_of||null})),
      warnings};
  }else{
    ctx.market={price:livePrice,error:'مفيش بيانات سوق متاحة دلوقتي — الموديل هيجاوب بدون أرقام سوق.'};
  }

  if(!ctx.archived_news){
    const savedNews=snap?snap.news:null;
    if(savedNews && savedNews.length){ archived=savedNews; archivedAt=(snap&&snap.generated_at)||null; }
    if(archived && archived.length){
      ctx.archived_news={as_of:archivedAt||null,
        note:'أرشيف محفوظ من نسخة سابقة — مش أخبار لحظية، ممنوع البناء عليه',
        items:archived.slice(0,5).map(n=>({title:n.title,published:n.published||null,
          age_hours:ageHours(n.published)}))};
    }
  }
  // Quality gate: a weak backtested setup gets no trade recommendation.
  try{
    const g=await ensureGate();
    ctx.quality_gate={pass:!!g.pass,pf:g.pf,trades:g.trades,minPF:g.minPF,minTrades:g.minTrades,
      bars:g.bars||null,source:g.source||null,error:g.error||null,at:g.at||null};
  }catch(e){}

  // Real internet search attached to the context the AI sees.
  if(withBasics){
    try{
      const web=await withTimeout(webResearch(symbol),15000,null);
      if(web && web.results && web.results.length){
        ctx.web_search={queried_at:web.queried_at,
          results:web.results.slice(0,8).map(r=>({title:r.title,source:r.source,published:r.published,
            age_min:newsAgeMin(r.published),link:r.link}))};
      }
    }catch(e){}
  }else if(PRO_CTX && PRO_CTX.web_search){
    ctx.web_search=PRO_CTX.web_search;
  }

  // Backtest is used as a quality gate only (quality_gate) — no strategy levels are injected.

  return ctx;
}
function emaSeries(vals,p){
  const k=2/(p+1); let e=vals[0]; const out=[e];
  for(let i=1;i<vals.length;i++){ e=vals[i]*k+e*(1-k); out.push(e); }
  return out;
}
function paintCtxChart(cs){
  const box=proEl('ctxChart'); if(!box) return;
  const cl=(cs||[]).map(c=>c.c);
  if(cl.length<20){ box.innerHTML=''; return; }
  const e20=emaSeries(cl,20), e50=emaSeries(cl,50);
  const all=[...cl,...e20,...e50], min=Math.min(...all), max=Math.max(...all), span=max-min||1;
  const w=300,hgt=70,pad=4;
  const line=a=>a.map((v,i)=>((pad+i*(w-2*pad)/(a.length-1)).toFixed(1)+','+(pad+(max-v)*(hgt-2*pad)/span).toFixed(1))).join(' ');
  box.innerHTML='<svg viewBox="0 0 '+w+' '+hgt+'" preserveAspectRatio="none">'+
    '<polyline points="'+line(cl)+'" fill="none" stroke="#2962ff" stroke-width="1.6"/>'+
    '<polyline points="'+line(e20)+'" fill="none" stroke="#089981" stroke-width="1" opacity=".8"/>'+
    '<polyline points="'+line(e50)+'" fill="none" stroke="#787b86" stroke-width="1" opacity=".8"/>'+
    '</svg>';
}
function drawCtxChart(symbol,tf){
  const box=proEl('ctxChart'); if(!box) return;
  if(PRO_LIVE_CHART && PRO_LIVE_CHART.length>=20){ paintCtxChart(PRO_LIVE_CHART.slice(-60)); return; }
  const useTf=['D1','H4','H1'].includes(tf)?tf:'D1';
  loadHistory(symbol,useTf).then(h=>paintCtxChart(h.candles.slice(-60))).catch(()=>{ box.innerHTML=''; });
}
async function refreshContext(quiet){
  const btn=proEl('ctxBtn'), stamp=proEl('ctxStamp');
  if(btn && !quiet) btn.disabled=true;
  if(stamp && !quiet) stamp.textContent='جاري سحب بيانات السوق...';
  try{
    PRO_CTX=await buildProContext(!quiet); PRO_CTX_AT=Date.now();
    const m=PRO_CTX.market||{};
    if(stamp){
      const t=new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      stamp.innerHTML=(m.source==='live'?'<span class="live-dot"></span>لحظي ':'')+
        esc(PRO_CTX.instrument||'')+' / '+esc(PRO_CTX.timeframe||'')+' · '+esc(t)+(m.error?' · '+esc(m.error):'');
    }
    const ind=proEl('ctxInd');
    if(ind) ind.innerHTML=renderIndicators(m, ageLabel(m.as_of||m.indicators_as_of||m.source_snapshot)).replace(/undefined/g,'-');
    renderMacro(m.macro);
    renderGate(PRO_CTX.quality_gate||null);
    renderWebNews(PRO_CTX.web_search||null);
    drawCtxChart(PRO_CTX.instrument,PRO_CTX.timeframe);
  }catch(e){ if(stamp) stamp.textContent='خطأ في تحديث السياق: '+e.message; }
  finally{ if(!quiet && btn) btn.disabled=false; }
}
/* Live gold ticker: refreshes price/indicators every 15s while the page is visible. */
var LIVE_TIMER=null;
function startLiveTicker(){
  stopLiveTicker();
  LIVE_TIMER=setInterval(function(){
    if(document.hidden || PRO_BUSY) return;
    if((proEl('proSymbol')?.value||'XAUUSD')!=='XAUUSD') return;
    refreshContext(true);
  },15000);
}
function stopLiveTicker(){ if(LIVE_TIMER){ clearInterval(LIVE_TIMER); LIVE_TIMER=null; } }

/* ---------- backtest quality gate ---------- */
function gateFromCandles(cs,symbol,tf,source){
  const trades=backtest(cs), stats=stratStats(trades);
  return {symbol,tf,pass:stats.trades>=STRAT.minTrades && stats.profit_factor>=STRAT.minPF,
    trades:stats.trades,pf:stats.profit_factor,win_rate:stats.win_rate,max_dd:stats.max_dd,
    total_r:stats.total_r,minTrades:STRAT.minTrades,minPF:STRAT.minPF,
    bars:cs.length,source:source||null,at:new Date().toISOString()};
}
// Stitch the long saved history with the live candles, scaling the live leg to the
// history's price basis so the seam doesn't look like a fake gap.
function alignSeries(hist,live){
  if(!hist||!hist.length) return live||[];
  if(!live||!live.length) return hist;
  const byT=new Map(hist.map(c=>[c.t,c.c]));
  const ratios=[];
  live.forEach(c=>{ const h=byT.get(c.t); if(h&&c.c) ratios.push(h/c.c); });
  let factor=1;
  if(ratios.length>=5){ ratios.sort((a,b)=>a-b); factor=ratios[Math.floor(ratios.length/2)]; }
  const scaled=factor===1?live:live.map(c=>({...c,o:c.o*factor,h:c.h*factor,l:c.l*factor,c:c.c*factor}));
  const map=new Map();
  hist.forEach(c=>map.set(c.t,c));
  scaled.forEach(c=>map.set(c.t,c));
  return [...map.values()].sort((a,b)=>a.t-b.t);
}
async function gateCandles(symbol,tf){
  let hist=null, live=null;
  try{ const h=await loadHistory(symbol,tf); hist=h.candles; }catch(e){}
  if(symbol==='XAUUSD' && PRO_CANDLES && PRO_CANDLES.length>=120 && PRO_CANDLES_TF===tf) live=PRO_CANDLES;
  if(hist && hist.length>=100 && live && live.length) return {candles:alignSeries(hist,live),source:'history+live'};
  if(hist && hist.length>=100) return {candles:hist,source:'history'};
  if(live && live.length>=100) return {candles:live,source:'live'};
  return {candles:null,source:'none'};
}
async function ensureGate(){
  const symbol=proEl('proSymbol')?.value||'XAUUSD', tf=proEl('proInterval')?.value||'H1';
  const key=symbol+':'+tf;
  if(GATE_CACHE.key===key && Date.now()-GATE_CACHE.at<10*60*1000) return GATE_CACHE.data;
  const got=await gateCandles(symbol,tf);
  if(!got.candles || got.candles.length<100){
    return {symbol,tf,pass:false,trades:0,pf:0,bars:(got.candles||[]).length,source:got.source,
      error:'مفيش شموع كفاية للباكتيست',minPF:STRAT.minPF,minTrades:STRAT.minTrades};
  }
  const g=gateFromCandles(got.candles,symbol,tf,got.source);
  GATE_CACHE={key,at:Date.now(),data:g};
  return g;
}
function renderGate(g){
  const box=proEl('ctxGate'); if(!box) return;
  if(!g){ box.className='gate'; box.innerHTML=''; return; }
  box.className='gate '+(g.pass?'ok':'bad');
  box.innerHTML='<b>بوابة الباكتيست</b> · '+(g.pass?'مقبول ✅':'مرفوض ⛔')+
    (g.error?(' · '+esc(g.error)):(' · PF '+esc(g.pf)+' · '+esc(g.trades)+' صفقة · '+esc(g.bars)+' شمعة'))+
    (g.pass?'':(' <i>المطلوب PF ≥ '+esc(g.minPF)+' و'+esc(g.minTrades)+' صفقة</i>'));
}
/* ---------- mandatory gate in chat ---------- */
function wantsTradeDecision(t){
  const s=String(t||'');
  if(/\b(BUY|SELL|entry|stop|target)\b/i.test(s)) return true;
  if(/(توصي|توصية|دخول|أدخل|ادخل|صفقة|إشارة|اشارة|هدف)/.test(s)) return true;
  return /(?:^|\s)(شراء|أشتري|اشتري|بيع|أبيع|ابيع)(?=\s|$|[؟?،,.!])/.test(s);
}
function hasTradeCall(t){
  return /\b(BUY|SELL)\b|(?:^|\s)(شراء|بيع)(?=\s|$)/i.test(t||'');
}
function gateBlockText(g){
  const symbol=proEl('proSymbol')?.value||'XAUUSD', tf=proEl('proInterval')?.value||'H1';
  return '⛔ **بوابة الباكتيست: مفيش توصية على '+symbol+' / '+tf+'**\n'+
    (g.error?g.error:('معامل الربح '+g.pf+' · '+g.trades+' صفقة من '+g.bars+' شمعة'))+
    ' — المطلوب PF ≥ '+g.minPF+' و'+g.minTrades+' صفقة.\n'+
    'التفسير النصي مسموح، لكن BUY/SELL على الإعداد ده ممنوع. جرّب فريم أو أداة تانية.';
}
function enforceGateOnReply(txt,g){
  if(!g || g.pass) return txt;
  if(!hasTradeCall(txt)) return txt;
  return gateBlockText(g)+'\n\n— اتلغى رد الموديل لأنه تضمّن توصية على إعداد مرفوض.';
}

/* ---------- internet search panel ---------- */
function newsAgeMin(p){
  let s=String(p||'');
  if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s=s.replace(' ','T')+'Z';
  const t=Date.parse(s);
  return isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):null;
}
function ageHours(p){
  const m=newsAgeMin(p);
  return m===null?null:+(m/60).toFixed(1);
}
function ageLabel(iso){
  // rss2json / TradingView times arrive as ISO or "YYYY-MM-DD HH:MM:SS" in UTC.
  let s=String(iso||'');
  if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s=s.replace(' ','T')+'Z';
  const t=Date.parse(s); if(!isFinite(t)) return '';
  const sec=Math.max(0,Math.round((Date.now()-t)/1000));
  if(sec<45) return 'الآن';
  if(sec<3600) return 'قبل '+Math.max(1,Math.round(sec/60))+'د';
  const h=Math.round(sec/3600);
  if(h<48) return 'قبل '+h+'س';
  return 'قبل '+Math.round(h/24)+'ي';
}
function renderMacro(macro){
  const box=proEl('ctxMacro'); if(!box) return;
  const rows=macro||[];
  if(!rows.length){ box.innerHTML=''; return; }
  box.innerHTML=rows.map(x=>{
    const ch=Number(x.change_pct);
    const cls=isFinite(ch)?(ch>0?'pos':ch<0?'neg':''):'';
    return '<div class="macro-cell"><span class="m-label">'+esc(x.symbol)+'</span>'+
      '<b>'+esc(fmt(x.price))+'</b>'+
      '<span class="m-chg '+cls+'">'+(isFinite(ch)?(ch>0?'+':'')+ch.toFixed(2)+'%':'-')+'</span>'+
      '<i class="age">'+esc(ageLabel(x.as_of))+'</i></div>';
  }).join('');
}
function renderWebNews(web){
  const box=proEl('ctxNews'); if(!box) return;
  const rows=(web&&web.results)||[];
  if(!rows.length){
    box.innerHTML='<p class="muted tiny">بحث الإنترنت: مفيش نتائج دلوقتي — التحليل هيعتمد على بيانات السوق.</p>';
    return;
  }
  box.innerHTML='<p class="muted tiny">بحث الإنترنت · '+rows.length+' نتيجة · '+esc(String(web.queried_at||'').slice(11,16))+' UTC</p>'+
    rows.slice(0,5).map(r=>'<a class="news-item" href="'+esc(r.link||'#')+'" target="_blank" rel="noopener"><span>'+
      esc(r.title)+'</span><i>'+esc(ageLabel(r.published))+'</i></a>').join('');
}
async function ensureWebSearch(force){
  const box=proEl('ctxNews');
  if(!PRO_CTX) return null;
  if(force && box) box.innerHTML='<p class="muted tiny">بيدور في الإنترنت...</p>';
  let web=null;
  try{ web=await withTimeout(webResearch(PRO_CTX.instrument||'XAUUSD',!!force),15000,null); }catch(e){}
  if((!web || !web.results || !web.results.length) && window.WEB_SEARCH_CACHE) web=WEB_SEARCH_CACHE.data;
  if(web && web.results && web.results.length){
    PRO_CTX.web_search={queried_at:web.queried_at,
      results:web.results.slice(0,8).map(r=>({...r,age_min:newsAgeMin(r.published)}))};
  }
  renderWebNews(PRO_CTX.web_search || web || null);
  return PRO_CTX.web_search || null;
}

/* ---------- structured recommendation ---------- */
function proLoadRec(){
  try{ return JSON.parse(localStorage.getItem(PRO_REC_KEY)||'null'); }catch(e){ return null; }
}
function proSaveRec(r){ try{ localStorage.setItem(PRO_REC_KEY,JSON.stringify(r)); }catch(e){} }
function renderRec(r){
  const out=proEl('recOut'); if(!out) return;
  if(!r){ out.innerHTML='<p class="muted tiny">اضغط «توليد» عشان الموديل يطلع دخول ووقف وهدف من البيانات الحالية.</p>'; return; }
  const dir=String(r.bias||'WAIT').toUpperCase();
  const cls=['BUY','SELL','WAIT'].includes(dir)?dir.toLowerCase():'wait';
  const targets=Array.isArray(r.targets)?r.targets.join(' / '):fmt(r.targets);
  out.innerHTML=[
    ['الاتجاه','<b class="rec-dir '+cls+'">'+esc(dir)+'</b>'],
    ['الدخول',esc(fmt(r.entry))],['الوقف',esc(fmt(r.stop))],['الهدف',esc(targets)],
    ['R:R',esc(fmt(r.rr))]
  ].map(x=>'<div class="rec-row"><span>'+x[0]+'</span>'+x[1]+'</div>').join('')+
    '<p class="rec-note">'+esc(fmt(r.conditions||r.wait_conditions))+' · '+esc(fmt(r.risk||r.risk_note))+'</p>';
}
async function proRecommend(){
  if(PRO_BUSY) return;
  const btn=proEl('recBtn'); if(btn) btn.disabled=true;
  err('');
  // Quality gate first: no recommendation on a weak backtested setup.
  const gate=await ensureGate();
  renderGate(gate);
  if(!gate.pass){
    renderRec(null);
    const out=proEl('recOut');
    if(out) out.innerHTML='<div class="rec-block"><b>⛔ بوابة الباكتيست رفضت التوصية</b>'+
      '<p class="tiny">'+(gate.error?esc(gate.error):('معامل الربح '+esc(gate.pf)+' · '+esc(gate.trades)+' صفقة'))+
      ' — المطلوب PF ≥ '+esc(gate.minPF)+' و'+esc(gate.minTrades)+' صفقة على نفس الأداة/الفريم. جرّب فريم أو أداة تانية.</p></div>';
    if(btn) btn.disabled=false;
    return;
  }
  const chosen=proActiveModels()[0];
  const all=proSortedModels();
  const models=(chosen?[chosen,...all.filter(p=>p!==chosen)]:all).slice(0,3);
  if(!models.length){ proConnect(); if(btn) btn.disabled=false; return; }
  if(!PRO_CTX||Date.now()-PRO_CTX_AT>10*60*1000){
    try{ PRO_CTX=await buildProContext(); PRO_CTX_AT=Date.now(); refreshContext(); }catch(e){}
  }
  await ensureWebSearch(true);
  const q='أعطني توصية عملية مبنية على السياق المرفق فقط. أرجع JSON فقط بالحقول: bias (BUY أو SELL أو WAIT)، entry، stop، targets (مصفوفة)، rr، conditions، risk. مفيش وعود ربح.';
  const messages=[{role:'system',content:PRO_SYSTEM+' أرجع JSON فقط بالحقول المطلوبة، بدون أي نص إضافي.'},
    {role:'user',content:JSON.stringify({question:q,context:PRO_CTX})}];
  let rec=null;
  for(const p of models.slice(0,3)){
    const r=await proCallChat(p,messages,null);
    if(r.ok) markProviderOK(p); else markProviderFail(p);
    if(r.ok){ const o=parseJSON(r.text); if(o&&o.bias){ rec=o; rec._model=p.name; break; } }
  }
  if(rec){ proSaveRec(rec); renderRec(rec); err('اتعملت توصية جديدة من '+rec._model+'.'); }
  else err('ما قدرتش أطلع توصية — جرّب تاني بعد ما تربط مزود شغال.');
  if(btn) btn.disabled=false;
}

/* ---------- chat engine ---------- */
async function proCallChat(p,messages,onChunk){
  const started=Date.now(), url=p.base_url.replace(/\/$/,'')+'/chat/completions';
  const headers={'Authorization':'Bearer '+p.api_key,'Content-Type':'application/json'};
  const base={model:p.model,messages,temperature:0.35,max_tokens:1400};
  try{
    const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({...base,stream:true})});
    if(!r.ok||!r.body) throw new Error('HTTP '+r.status);
    const reader=r.body.getReader(), dec=new TextDecoder();
    let buf='', full='';
    for(;;){
      const {done,value}=await reader.read(); if(done) break;
      buf+=dec.decode(value,{stream:true});
      let i;
      while((i=buf.indexOf('\n\n'))>=0){
        const raw=buf.slice(0,i); buf=buf.slice(i+2);
        for(const line of raw.split('\n')){
          if(!line.startsWith('data:')) continue;
          const data=line.slice(5).trim(); if(!data||data==='[DONE]') continue;
          try{ const j=JSON.parse(data), t=j.choices?.[0]?.delta?.content; if(t){ full+=t; if(onChunk) onChunk(full); } }catch(e){}
        }
      }
    }
    if(!full.trim()) throw new Error('empty stream');
    return {ok:true,text:full,error:null,ms:Date.now()-started,name:p.name,model:p.model};
  }catch(e){
    try{
      const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({...base,stream:false})});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const d=await r.json(), text=(d.choices||[])[0]?.message?.content||'';
      if(!text) throw new Error('empty response');
      if(onChunk) onChunk(text);
      return {ok:true,text,error:null,ms:Date.now()-started,name:p.name,model:p.model};
    }catch(e2){ return {ok:false,text:'',error:redact(e2.message,p.api_key),ms:Date.now()-started,name:p.name,model:p.model}; }
  }
}
async function proSend(preset){
  if(PRO_BUSY) return;
  const input=proEl('proInput');
  const text=(preset||input?.value||'').trim();
  if(!text) return;
  if(input) input.value='';
  err(''); proPush('user',text);
  // Mandatory gate in chat too: a trade question on a weak setup is refused before any AI call.
  const gate=await ensureGate();
  renderGate(gate);
  if(!gate.pass && wantsTradeDecision(text)){
    proPush('bot',gateBlockText(gate),{model:'بوابة الجودة'});
    return;
  }
  const models=proActiveModels();
  if(!models.length){
    const msg='لسه مفيش ذكاء اصطناعي مربوط. الموديلات المجانية محتاجة مفتاح (Groq/Gemini/Mistral/Cerebras/HF). المفتاح بيتحفظ في متصفح الهاتف بس، والتطبيق هيشتغل من غير أي كمبيوتر.';
    const id=proPush('bot',msg);
    const body=proFind(id)?.querySelector('.body');
    if(body) body.innerHTML=proMd(msg)+
      '<div class="foot"><button onclick="proConnect()"><svg class="ico"><use href="#i-key"/></svg> اربط AI مجاني الآن</button></div>';
    proConnect();
    return;
  }
  if(!PRO_CTX||Date.now()-PRO_CTX_AT>10*60*1000){
    const stamp=proEl('ctxStamp'); if(stamp) stamp.textContent='بحدّث بيانات السوق قبل الرد...';
    try{ PRO_CTX=await buildProContext(); PRO_CTX_AT=Date.now(); refreshContext(); }catch(e){}
  }
  await ensureWebSearch(true);
  const hist=proChat().slice(-5,-1).map(m=>({role:m.role==='user'?'user':'assistant',content:String(m.text||'').slice(0,700)}));
  const messages=[{role:'system',content:PRO_SYSTEM},...hist,
    {role:'user',content:JSON.stringify({question:text,context:PRO_CTX})}];

  PRO_BUSY=true;
  const btn=proEl('sendBtn'), lbl=btn?.querySelector('span');
  if(btn){ btn.disabled=true; if(lbl) lbl.textContent='جاري الرد...'; }
  const ids=models.map(p=>{
    const id=proPush('bot','جاري التحليل...',{model:p.name,at:proTime()});
    const body=proFind(id)?.querySelector('.body');
    if(body) body.innerHTML='<span class="typing"><i></i><i></i><i></i></span> جاري التحليل...';
    return id;
  });
  try{
    if(models.length>1){
      await Promise.all(models.map((p,k)=>proCallChat(p,messages,partial=>{
        proUpdate(ids[k],partial,{model:p.name,at:proTime()});
      }).then(r=>{
        r.ok?markProviderOK(p):markProviderFail(p);
        const final=r.ok?enforceGateOnReply(r.text,gate):'تعذّر الحصول على رد من '+p.name+' — '+r.error;
        proUpdate(ids[k],final,{model:p.name,ms:r.ms,at:proTime()});
      })));
    }else{
      const p=models[0], id=ids[0];
      const fallbacks=proSortedModels().filter(x=>x.base_url!==p.base_url||x.model!==p.model).slice(0,3);
      let r=await proCallChat(p,messages,partial=>proUpdate(id,partial,{model:p.name,at:proTime()}));
      if(!r.ok) markProviderFail(p); else markProviderOK(p);
      let used=p, tries=0;
      while(!r.ok&&tries<fallbacks.length){
        const next=fallbacks[tries++];
        proUpdate(id,'⚠️ '+p.name+' فشل ('+r.error+') — جاري التجربة مع '+next.name+'...',{model:next.name,at:proTime()});
        r=await proCallChat(next,messages,partial=>proUpdate(id,partial,{model:next.name,at:proTime()}));
        if(!r.ok) markProviderFail(next); else markProviderOK(next);
        used=next;
      }
      const final=r.ok?enforceGateOnReply(r.text,gate):'كل المزودات فشلت. آخر خطأ: '+r.error;
      proUpdate(id,final,{model:used.name,ms:r.ms,at:proTime()});
    }
  }catch(e){ err('خطأ: '+e.message); }
  finally{
    PRO_BUSY=false;
    if(btn){ btn.disabled=false; const l=btn.querySelector('span'); if(l) l.textContent='إرسال'; }
  }
}

/* ---------- automatic analysis + phone alerts ---------- */
var AUTO_TIMER=null;
function proSignalKey(sym,tf){ return 'market-ai-signal-'+sym+'-'+tf; }
function proNotifyRec(sym,tf,rec){
  const targets=Array.isArray(rec.targets)?rec.targets.join(' / '):fmt(rec.targets);
  const body=sym+' / '+tf+' · '+String(rec.bias||'').toUpperCase()+' · دخول '+fmt(rec.entry)+' · وقف '+fmt(rec.stop)+' · هدف '+targets;
  const toast=proEl('autoToast');
  if(toast){ toast.textContent='تنبيه AI: '+body; toast.style.display='block';
    setTimeout(()=>{ toast.style.display='none'; },16000); }
  if('Notification' in window && Notification.permission==='granted'){
    const title='Market AI Pro — توصية AI';
    const opts={body,icon:'icon-192.png',tag:'market-ai-ai',data:{url:'./pro.html'}};
    if('serviceWorker' in navigator){
      navigator.serviceWorker.ready
        .then(reg=>reg.showNotification(title,opts))
        .catch(()=>{ try{ new Notification(title,opts); }catch(e){} });
    }else{
      try{ new Notification(title,opts); }catch(e){}
    }
  }
}
async function proAutoAnalyze(){
  const sym=proEl('proSymbol')?.value||'XAUUSD', tf=proEl('proInterval')?.value||'H1';
  // Keep context fresh so AI sees latest market+news.
  if(!PRO_CTX || Date.now()-PRO_CTX_AT > 4*60*1000){
    try{ PRO_CTX=await buildProContext(); PRO_CTX_AT=Date.now(); refreshContext(); }catch(e){}
  }
  const models=proActiveModels();
  if(!models.length) return null;
  const gate=await ensureGate();
  if(!gate.pass) return null;
  // Use a single model for auto (faster, less quota); manual button uses all.
  const p=models[0];
  const q='أعطني توصية عملية مبنية على السياق المرفق فقط. أرجع JSON فقط بالحقول: bias (BUY أو SELL أو WAIT)، entry، stop، targets (مصفوفة)، rr، conditions، risk. مفيش وعود ربح.';
  const messages=[{role:'system',content:PRO_SYSTEM+' أرجع JSON فقط بالحقول المطلوبة، بدون أي نص إضافي.'},
    {role:'user',content:JSON.stringify({question:q,context:PRO_CTX})}];
  try{
    const r=await proCallChat(p,messages,null);
    if(!r.ok){ markProviderFail(p); return null; }
    markProviderOK(p);
    const o=parseJSON(r.text);
    if(!o || !o.bias) return null;
    const rec={...o,_model:p.name};
    const last=proLoadRec();
    const changed=!last || last.bias!==rec.bias || String(last.entry)!==String(rec.entry) || String(last.stop)!==String(rec.stop);
    proSaveRec(rec); renderRec(rec);
    if(changed && String(rec.bias).toUpperCase()!=='WAIT') proNotifyRec(sym,tf,rec);
    return rec;
  }catch(e){ return null; }
}
function stopAuto(){ if(AUTO_TIMER){ clearInterval(AUTO_TIMER); AUTO_TIMER=null; } }
function startAuto(mins){
  stopAuto();
  const m=mins||5;
  const ms=m*60*1000;
  AUTO_TIMER=setInterval(proAutoAnalyze,ms);
  proAutoAnalyze();
}
async function registerPeriodic(mins){
  if(!('serviceWorker' in navigator)) return;
  try{
    const reg=await navigator.serviceWorker.ready;
    if(!reg.periodicSync?.register) return;
    try{ await reg.periodicSync.register('market-ai-check',{minInterval:mins*60*1000}); }
    catch(e){ // Android Chrome may enforce a longer minimum — retry with 12h.
      await reg.periodicSync.register('market-ai-check',{minInterval:12*60*60*1000}).catch(()=>{});
    }
  }catch(e){}
}
async function toggleAuto(){
  const box=proEl('proAuto'), on=!!box?.checked;
  const prefs=proPrefs(); prefs.auto={on,mins:5}; proSavePrefs(prefs);
  if(on){
    if('Notification' in window && Notification.permission==='default'){
      try{ await Notification.requestPermission(); }catch(e){}
    }
    startAuto(5);
    registerPeriodic(720);
    err('التحليل التلقائي شغال (كل 5 دق) — AI يحلل السوق+الأخبار ويرسل توصية عند التغير. تنبيه خلفي (خشن) كل ~12 ساعة.');
  }else{
    stopAuto(); err('التحليل التلقائي متوقف.');
  }
}

function proInit(){
  try{ localStorage.removeItem('market-ai-pro-chat-v1'); }catch(e){}
  const sel=proEl('proSymbol');
  if(sel){
    sel.innerHTML=Object.entries(SYMBOLS).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('');
    sel.value=(proPrefs().symbol)||'XAUUSD';
  }
  const iv=proEl('proInterval'); if(iv) iv.value=(proPrefs().interval)||'H1';
  proFillModels();
  const q=proEl('quickPrompts');
  if(q) q.innerHTML=PRO_PROMPTS.map(x=>'<button onclick="proSend(this.querySelector(\'span\').textContent)">'+
    '<svg class="ico"><use href="#i-bolt"/></svg><span>'+esc(x)+'</span></button>').join('');
  proRenderChat();
  renderRec(proLoadRec());
  const input=proEl('proInput');
  if(input) input.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); proSend(); } });
  const harmony=proEl('proHarmony'); if(harmony){
    harmony.checked=!!proPrefs().harmony;
    harmony.addEventListener('change',()=>{
      const prefs=proPrefs(); prefs.harmony=harmony.checked; proSavePrefs(prefs);
      err(harmony.checked?'تناغم المزودين شغال — التحليل هيوزّع على كل المزودات المتاحة.':'تناغم المزودين متوقف.');
    });
  }
  const auto=proEl('proAuto'); if(auto){
    const ap=proPrefs().auto||{on:false,mins:5};
    auto.checked=!!ap.on;
    if(ap.on){ startAuto(ap.mins||5); registerPeriodic(720); }
  }
  [proEl('proSymbol'),proEl('proInterval'),proEl('proModel')].forEach(n=>{
    if(n) n.addEventListener('change',()=>{
      const prefs=proPrefs();
      prefs.symbol=proEl('proSymbol')?.value; prefs.interval=proEl('proInterval')?.value;
      prefs.model=proEl('proModel')?.value; proSavePrefs(prefs);
      localStorage.removeItem(proSignalKey(prefs.symbol||'XAUUSD',prefs.interval||'H1'));
    });
  });
  // Changing instrument/timeframe must rebuild context and re-run the gate.
  [proEl('proSymbol'),proEl('proInterval')].forEach(n=>{
    if(n) n.addEventListener('change',()=>{
      PRO_CANDLES=null; PRO_CANDLES_TF=null; GATE_CACHE={key:'',at:0,data:null}; PRO_CTX=null;
      refreshContext();
    });
  });
  refreshContext();
  startLiveTicker();
}
proInit();
