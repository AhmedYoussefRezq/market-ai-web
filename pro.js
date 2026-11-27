/* Market AI Pro — chat-first trading analyst.
   Static app: free public data + keys kept in this browser. ANALYSIS ONLY. */

const PRO_CHAT_KEY = 'market-ai-pro-chat-v1';
const PRO_PREF_KEY = 'market-ai-pro-prefs-v1';
const PRO_REC_KEY = 'market-ai-pro-rec-v1';
const PRO_SYSTEM = `أنت «Market AI Pro»، مساعد أبحاث تداول محترف. قواعدك الصارمة:
1) استخدم فقط البيانات المرفقة في السياق (JSON). لا تخترع أسعاراً أو أخباراً أو أرقاماً أو تواريخ. لو معلومة غير موجودة قل «غير متوفرة في البيانات المرفقة».
2) أجب بالعربية المصرية، باختصار ووضوح، بعناوين ونقاط قصيرة. لا وعود ربح، ولا توصية نهائية بالشراء أو البيع.
3) فرّق صراحة بين: (أ) بيانات السوق الفعلية، (ب) قواعد استراتيجية مختبرة، (ج) رأي AI. اذكر أي واحد استخدمته في كل نقطة.
4) دائماً اذكر المخاطرة، وأن البيانات التاريخية ليست ضماناً، وأن هذا التطبيق تحليل فقط لا يرسل أوامر ولا يدير أموالاً.
5) لو طلب المستخدم تنفيذ صفقة أو نصيحة مالية شخصية، اعتذر بلطف وقل: التطبيق للتحليل فقط، وجرّب أي فكرة على حساب ديمو بنفسك.
6) لا تقل «متأكد» أو «مضمون». استخدم صيغ تحفظ مثل: «البيانات المتاحة تشير إلى...».
7) إذا كانت بيانات السوق قديمة أو بها تحذيرات، اذكر ذلك في بداية الرد.`;

const PRO_PROMPTS = [
  'حلّل الأداة الحالية وأعطني توصية',
  'إيه رأيك في الإشارة الحالية؟',
  'احسب حجم اللوت بـ 1% مخاطرة'
];

var PRO_CTX = null;
var PRO_CTX_AT = 0;
var PRO_BUSY = false;

function proEl(id){ return document.getElementById(id); }
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
    box.innerHTML='<div class="msg bot">'+aiAv+'<div class="bubble"><div class="who"><b>Market AI Pro</b></div>'+
      '<div class="body">أهلاً! اسألني عن السوق أو اطلب تحليل أداة معينة. أنا بشوف بيانات السوق والباكتيست المرفقة قبل ما أجاوب — '+
      'ومش باخترع أرقام. التطبيق ده <b>تحليل بس</b> ومش بيفتح أوامر.'+
      '<div class="foot"><button onclick="proConnect()"><svg class="ico"><use href="#i-key"/></svg> اربط AI مجاني</button></div></div></div></div>';
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
  const txt=all.map(m=>`[${m.at}] ${m.role==='user'?'أنت':(m.meta.model||'AI')}\n${m.text}\n`).join('\n---\n');
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
function toggleSidebar(){
  const rail=proEl('rail'), back=proEl('railBackdrop'); if(!rail) return;
  const open=rail.classList.toggle('open');
  if(back) back.classList.toggle('show',open);
}
function proConnect(){
  const ov=proEl('settingsOverlay');
  if(ov){ ov.style.display='flex'; document.body.classList.add('modal-open'); }
  const k=proEl('quickKey'); if(k) setTimeout(()=>k.focus(),250);
  err('الصق مفتاح AI مجاني واضغط الزر — المفاتيح بتتخزن في متصفحك بس.');
}
function proQuickProvider(source){
  if(source==='openrouter'){ quickSetup(); proFillModels(); return; }
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
  if(action==='quick') quickSetup();
  else if(action==='templates') addTemplates();
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
function proActiveModels(){
  const now=Date.now();
  const all=providers().filter(p=>p.api_key&&p.enabled&&p.base_url&&p.model)
    .sort((a,b)=>{
      const ta=Number(localStorage.getItem(proFailKey(a))||0), tb=Number(localStorage.getItem(proFailKey(b))||0);
      return (ta>now?1:0)-(tb>now?1:0);
    });
  const sel=proEl('proModel');
  if(proEl('proHarmony')?.checked) return all.slice(0,4);
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
async function buildProContext(){
  const symbol=proEl('proSymbol')?.value||'XAUUSD';
  const interval=proEl('proInterval')?.value||'H1';
  const ctx={generated_at:new Date().toISOString().slice(0,19),instrument:symbol,timeframe:interval,mode:'ANALYSIS ONLY'};
  let livePrice=null;
  try{ livePrice=await withTimeout(quickPrice(symbol),4000,null); }catch(e){}
  let snap=null;
  try{ snap=await withTimeout(staticSnapshot(symbol,interval),4000,null); }catch(e){}
  if(!snap||!((snap.indicators||{}).last)){
    try{ snap=await withTimeout(marketSnapshot(symbol,interval),9000,null); }catch(e){}
  }
  if(snap&&((snap.indicators||{}).last||livePrice!==null)){
    const i=snap.indicators||{}, warnings=[...(snap.warnings||[])];
    const age=snap.generated_at&&isFinite(Date.parse(snap.generated_at))?Date.now()-Date.parse(snap.generated_at):Infinity;
    if(age>6*3600*1000) warnings.push('النسخة المحفوظة على GitHub قديمة — الأرقام تقريبية');
    if(livePrice!==null) warnings.push('سعر لحظي من مصدر عام: '+livePrice);
    ctx.market={label:snap.label||SYMBOLS[symbol]?.label,source_snapshot:snap.generated_at,
      price:livePrice!==null?livePrice:i.last,last:livePrice!==null?livePrice:i.last,
      snapshot_price:i.last,change_pct:i.change_pct,
      ema20:i.ema20,ema50:i.ema50,sma200:i.sma200,rsi14:i.rsi14,atr14:i.atr14,atr_pct:i.atr_pct,
      trend:i.trend,high20:i.high20,low20:i.low20,bars:i.bars,
      recent_candles:(snap.recent_candles||[]).slice(-8),
      macro:(snap.macro||[]).map(x=>({symbol:x.symbol,price:x.price,change_pct:x.change_pct,trend:x.trend})),
      news:(snap.news||[]).slice(0,7).map(x=>x.title),warnings};
  }else{
    ctx.market={price:livePrice,error:'مفيش بيانات سوق متاحة دلوقتي — الموديل هيجاوب بدون أرقام سوق.'};
  }

  const stratTf=['D1','H4','H1'].includes(interval)?interval:'D1';
  try{
    const h=await loadHistory(symbol,stratTf);
    const st=stratStats(backtest(h.candles));
    const sig=stratSignal(h.candles);
    ctx.rule_strategy={symbol,timeframe:stratTf,bars:h.candles.length,source:h.source,
      result:{trades:st.trades,win_rate:st.win_rate,profit_factor:st.profit_factor,
        total_r:st.total_r,max_dd:st.max_dd,avg_r:st.avg_r},
      current_signal:sig?{bias:sig.bias,rsi:sig.rsi,trend:sig.trend,entry:sig.entry,sl:sig.sl,tp:sig.tp}:null,
      note:'قواعد RSI50 + EMA20/50 + ATR — هامش رفيع، مش ضمان'};
  }catch(e){ ctx.rule_strategy={error:String(e.message||e)}; }

  return ctx;
}
function emaSeries(vals,p){
  const k=2/(p+1); let e=vals[0]; const out=[e];
  for(let i=1;i<vals.length;i++){ e=vals[i]*k+e*(1-k); out.push(e); }
  return out;
}
function drawCtxChart(symbol,tf){
  const box=proEl('ctxChart'); if(!box) return;
  const useTf=['D1','H4','H1'].includes(tf)?tf:'D1';
  loadHistory(symbol,useTf).then(h=>{
    const cs=h.candles.slice(-60), cl=cs.map(c=>c.c);
    if(cl.length<20){ box.innerHTML=''; return; }
    const e20=emaSeries(cl,20), e50=emaSeries(cl,50);
    const all=[...cl,...e20,...e50], min=Math.min(...all), max=Math.max(...all), span=max-min||1;
    const w=300,hgt=70,pad=4;
    const line=a=>a.map((v,i)=>((pad+i*(w-2*pad)/(a.length-1)).toFixed(1)+','+(pad+(max-v)*(hgt-2*pad)/span).toFixed(1))).join(' ');
    box.innerHTML='<svg viewBox="0 0 '+w+' '+hgt+'" preserveAspectRatio="none">'+
      '<polyline points="'+line(cl)+'" fill="none" stroke="#2dd4bf" stroke-width="1.6"/>'+
      '<polyline points="'+line(e20)+'" fill="none" stroke="#f0b64a" stroke-width="1" opacity=".8"/>'+
      '<polyline points="'+line(e50)+'" fill="none" stroke="#5aa9ff" stroke-width="1" opacity=".6"/>'+
      '</svg>';
  }).catch(()=>{ box.innerHTML=''; });
}
async function refreshContext(){
  const btn=proEl('ctxBtn'), stamp=proEl('ctxStamp');
  if(btn) btn.disabled=true;
  if(stamp) stamp.textContent='جاري سحب بيانات السوق والباكتيست...';
  try{
    PRO_CTX=await buildProContext(); PRO_CTX_AT=Date.now();
    const m=PRO_CTX.market||{};
    if(stamp) stamp.textContent=(PRO_CTX.instrument||'')+' / '+(PRO_CTX.timeframe||'')+' · '+
      (m.source_snapshot||PRO_CTX.generated_at)+(m.error?' · '+m.error:'');
    const ind=proEl('ctxInd');
    if(ind) ind.innerHTML=renderIndicators(m).replace(/undefined/g,'-');
    drawCtxChart(PRO_CTX.instrument,PRO_CTX.timeframe);
    const rs=PRO_CTX.rule_strategy||{};
    const s=proEl('ctxStrat');
    if(s) s.innerHTML=rs.error?esc(rs.error):
      `${esc(rs.symbol)} · ${esc(rs.timeframe)} · ${rs.bars} شمعة · ${rs.result.trades} صفقة · PF <b>${esc(rs.result.profit_factor)}</b> · DD ${esc(rs.result.max_dd)}R<br>الإشارة: <b>${esc(rs.current_signal?.bias||'WAIT')}</b>`;
    const w=proEl('ctxWarnings');
    if(w) w.textContent=(m.warnings||[]).length?'تحذيرات البيانات: '+m.warnings.join(' · '):'';
  }catch(e){ if(stamp) stamp.textContent='خطأ في تحديث السياق: '+e.message; }
  finally{ if(btn) btn.disabled=false; }
}

/* ---------- structured recommendation ---------- */
function proLoadRec(){
  try{ return JSON.parse(localStorage.getItem(PRO_REC_KEY)||'null'); }catch(e){ return null; }
}
function proSaveRec(r){ try{ localStorage.setItem(PRO_REC_KEY,JSON.stringify(r)); }catch(e){} }
function renderRec(r){
  const out=proEl('recOut'); if(!out) return;
  if(!r){ out.innerHTML='<p class="note tiny">اضغط «أنشئ توصية» عشان الموديل يطلع دخول ووقف وهدف من البيانات الحالية.</p>'; return; }
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
  const chosen=proActiveModels()[0];
  const all=providers().filter(p=>p.api_key&&p.enabled&&p.base_url&&p.model);
  const models=(chosen?[chosen,...all.filter(p=>p!==chosen)]:all).slice(0,3);
  if(!models.length){ proConnect(); if(btn) btn.disabled=false; return; }
  if(!PRO_CTX||Date.now()-PRO_CTX_AT>10*60*1000){
    try{ PRO_CTX=await buildProContext(); PRO_CTX_AT=Date.now(); refreshContext(); }catch(e){}
  }
  const q='أعطني توصية عملية مبنية على السياق المرفق فقط. أرجع JSON فقط بالحقول: bias (BUY أو SELL أو WAIT)، entry، stop، targets (مصفوفة)، rr، conditions، risk. مفيش وعود ربح.';
  const messages=[{role:'system',content:PRO_SYSTEM+' أرجع JSON فقط بالحقول المطلوبة، بدون أي نص إضافي.'},
    {role:'user',content:JSON.stringify({question:q,context:PRO_CTX})}];
  let rec=null;
  for(const p of models.slice(0,3)){
    const r=await proCallChat(p,messages,null);
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
  const models=proActiveModels();
  if(!models.length){
    const msg='لسه مفيش ذكاء اصطناعي مربوط. الموديلات المجانية محتاجة مفتاح OpenRouter/Groq مجاني (تسجيل في دقيقة). المفتاح بيتحفظ في متصفح الهاتف بس، والتطبيق هيشتغل من غير أي كمبيوتر.';
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
  const hist=proChat().slice(-8,-1).map(m=>({role:m.role==='user'?'user':'assistant',content:String(m.text||'').slice(0,1200)}));
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
        const final=r.ok?r.text:'تعذّر الحصول على رد من '+p.name+' — '+r.error;
        proUpdate(ids[k],final,{model:p.name,ms:r.ms,at:proTime()});
      })));
    }else{
      const all=providers().filter(p=>p.api_key&&p.enabled&&p.base_url&&p.model);
      const p=models[0], id=ids[0];
      const fallbacks=all.filter(x=>x.base_url!==p.base_url||x.model!==p.model).slice(0,3);
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
      const final=r.ok?r.text:'كل المزودات فشلت. آخر خطأ: '+r.error;
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
function proNotify(sym,tf,sig){
  const body=sym+' / '+tf+' · '+sig.bias+' · دخول '+fmt(sig.entry)+' · وقف '+fmt(sig.sl)+' · هدف '+fmt(sig.tp);
  const toast=proEl('autoToast');
  if(toast){ toast.textContent='تنبيه صفقة: '+body; toast.style.display='block';
    setTimeout(()=>{ toast.style.display='none'; },14000); }
  if('Notification' in window && Notification.permission==='granted'){
    try{ new Notification('Market AI Pro — صفقة محتملة',{body,icon:'icon-192.png',tag:'market-ai-signal'}); }catch(e){}
  }
}
async function proAutoAnalyze(){
  const sym=proEl('proSymbol')?.value||'XAUUSD', tf=proEl('proInterval')?.value||'H1';
  const useTf=['D1','H4','H1'].includes(tf)?tf:'D1';
  try{
    const h=await loadHistory(sym,useTf);
    const sig=stratSignal(h.candles);
    const bias=sig?.bias||'WAIT', key=proSignalKey(sym,tf);
    const last=localStorage.getItem(key)||'';
    if(bias!==last){
      localStorage.setItem(key,bias);
      if(bias!=='WAIT') proNotify(sym,useTf,sig);
    }
    return sig;
  }catch(e){ return null; }
}
function stopAuto(){ if(AUTO_TIMER){ clearInterval(AUTO_TIMER); AUTO_TIMER=null; } }
function startAuto(mins){
  stopAuto();
  const ms=(mins||15)*60*1000;
  AUTO_TIMER=setInterval(proAutoAnalyze,ms);
  proAutoAnalyze();
}
async function registerPeriodic(mins){
  if(!('serviceWorker' in navigator)) return;
  try{
    const reg=await navigator.serviceWorker.ready;
    if(reg.periodicSync?.register) await reg.periodicSync.register('market-ai-check',{minInterval:mins*60*1000});
  }catch(e){}
}
async function toggleAuto(){
  const box=proEl('proAuto'), on=!!box?.checked;
  const prefs=proPrefs(); prefs.auto={on,mins:15}; proSavePrefs(prefs);
  if(on){
    if('Notification' in window && Notification.permission==='default'){
      try{ await Notification.requestPermission(); }catch(e){}
    }
    startAuto(15); registerPeriodic(15);
    err('التحليل التلقائي شغال — تنبيه لما تظهر إشارة جديدة.');
  }else{
    stopAuto(); err('التحليل التلقائي متوقف.');
  }
}

function proInit(){
  const sel=proEl('proSymbol');
  if(sel){
    sel.innerHTML=Object.entries(SYMBOLS).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('');
    sel.value=(proPrefs().symbol)||'XAUUSD';
  }
  const iv=proEl('proInterval'); if(iv) iv.value=(proPrefs().interval)||'H1';
  const cons=proEl('proConsensus'); if(cons) cons.checked=!!proPrefs().consensus;
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
    const ap=proPrefs().auto||{on:false,mins:15};
    auto.checked=!!ap.on;
    if(ap.on){ startAuto(ap.mins||15); registerPeriodic(ap.mins||15); }
  }
  [proEl('proSymbol'),proEl('proInterval'),proEl('proModel')].forEach(n=>{
    if(n) n.addEventListener('change',()=>{
      const prefs=proPrefs();
      prefs.symbol=proEl('proSymbol')?.value; prefs.interval=proEl('proInterval')?.value;
      prefs.model=proEl('proModel')?.value; proSavePrefs(prefs);
      localStorage.removeItem(proSignalKey(prefs.symbol||'XAUUSD',prefs.interval||'H1'));
    });
  });
  refreshContext();
}
proInit();
