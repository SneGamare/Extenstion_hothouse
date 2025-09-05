console.log('smart-mvp: content script executing on', location.href);
console.log('smart-mvp: Chrome extension APIs available:', {
  storage: typeof chrome.storage !== 'undefined',
  runtime: typeof chrome.runtime !== 'undefined',
  tabs: typeof chrome.tabs !== 'undefined'
});

const STATE = { profile: null, panel: null, lastAnalysis: null };

// Ensure demo profile exists once
try {
chrome.storage.sync.get(null, (data) => {
    console.log('smart-mvp: storage.get callback received data:', data);
  STATE.profile = data || {};
    if (!STATE.profile.demoProfileV3) {
      console.log('smart-mvp: loading profile.json from extension');
      fetch(chrome.runtime.getURL("profile.json"))
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(p => {
          console.log('smart-mvp: profile.json loaded successfully');
          chrome.storage.sync.set({ demoProfileV3: p }, () => {
            console.log('smart-mvp: profile saved to storage, calling init()');
            init();
          });
        })
        .catch(e => {
          console.error("Failed to load profile.json:", e);
          // Initialize anyway with empty profile
          init();
        });
    } else {
      console.log('smart-mvp: profile already exists, calling init()');
      init();
    }
  });
} catch (e) {
  console.error('smart-mvp: storage.sync.get failed:', e);
  // Fallback: try to initialize anyway
  setTimeout(() => init(), 100);
}

function init(){
  ensurePanel();
  analyzePage();
  observeAndCapture();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "MVP_TEST_AUTOFILL") {
    tryAutofill();
  }
});

function ensurePanel() {
  if (document.getElementById("smart-mvp-panel")) return;
  console.log("smart-mvp: ensurePanel creating panel");
  const el = document.createElement("div");
  el.id = "smart-mvp-panel";
  el.className = 'collapsed';
  el.innerHTML = `
    <header>
      <div>Smart Autofill • Advisor</div>
      <button id="smart-mvp-close">×</button>
    </header>
    <div class="body">
      <div class="pill general" id="smart-pill">General</div>
      <div id="smart-mvp-summary">
        <div class="main">Scanning this page…</div>
        <div class="sub">I’ll use your demo financial profile for advice.</div>
      </div>
      <div class="row">
        <button id="smart-mvp-fill">Autofill Basics</button>
        <button id="smart-mvp-why">Why?</button>
      </div>
      <div id="smart-mvp-askrow">
        <input id="smart-mvp-q" placeholder="Ask anything (e.g., is this worth it?)"/>
        <button id="smart-mvp-ask">Ask</button>
      </div>
      <div id="smart-mvp-answer"></div>
    </div>
  `;
  document.documentElement.appendChild(el);
  document.getElementById("smart-mvp-close").onclick = (e) => { e.stopPropagation(); togglePanel(false); };
  el.querySelector('header').onclick = () => togglePanel();
  document.getElementById("smart-mvp-fill").onclick = () => tryAutofill();
  document.getElementById("smart-mvp-why").onclick = () => showWhy();
  document.getElementById("smart-mvp-ask").onclick = () => askFreeform();
  STATE.panel = el;
  
  // collapsed summary preview
  const collapsedPreview = document.createElement('div');
  collapsedPreview.className = 'collapsed-preview';
  collapsedPreview.textContent = 'Smart Autofill';
  el.appendChild(collapsedPreview);
  collapsedPreview.onclick = ()=> togglePanel(true);
}

function togglePanel(open) {
  const el = document.getElementById('smart-mvp-panel');
  if (!el) return;
  if (typeof open === 'boolean') {
    el.classList.toggle('collapsed', !open);
  } else {
    el.classList.toggle('collapsed');
  }
}

async function analyzePage() {
  const text = getVisibleText();
  const context = detectContext(text);
  const pill = document.getElementById("smart-pill");
  pill.className = "pill " + (context==="fd" ? "fd" : context==="credit_card" ? "cc" : "general");
  pill.textContent = context==="fd" ? "Fixed Deposit" : context==="credit_card" ? "Credit Card" : "General";

  // Auto-ask a contextual question
  if (context === "fd") {
    await askQuestion("Should I switch to this FD?", text, context);
  } else if (context === "credit_card") {
    await askQuestion("Is this credit card better than my current cards?", text, context);
  } else {
    renderSummary({ context, recommendation: { tag:"info", msg:"Browsing…" }, details:{} });
  }
}

function renderSummary(result) {
  const el = document.getElementById("smart-mvp-summary");
  if (!el) return;
  const { context, recommendation, details } = result;
  
  // Don't show the full AI answer in summary - just show a generic message
  if (context === "fd") {
    el.querySelector(".main").textContent = "FD analysis complete";
  } else if (context === "credit_card") {
    el.querySelector(".main").textContent = "Credit card analysis complete";
  } else {
    el.querySelector(".main").textContent = "Ready for questions";
  }
  
  el.querySelector(".sub").textContent = context==="general" ? "Ask a question or keep browsing."
    : (details?.extractedRatePct!=null ? `Detected FD rate: ${details.extractedRatePct}%` : "Using your profile for advice.");
}

function showWhy() {
  const ans = document.getElementById("smart-mvp-answer").textContent || "No advice yet.";
  alert(ans);
}

async function askFreeform(){
  const q = document.getElementById("smart-mvp-q").value.trim();
  if(!q) return;
  const text = getVisibleText();
  await askQuestion(q, text, detectContext(text));
}

async function askQuestion(q, snippet=null, context=null){
  const answerEl = document.getElementById("smart-mvp-answer");
  answerEl.textContent = "Thinking…";
  const prof = (await chrome.storage.sync.get("demoProfileV3")).demoProfileV3;
  const body = {
    url: location.href,
    question: q,
    snippet: (snippet || getVisibleText()).slice(0, 10000),
    profile: prof,
    context: context || detectContext(getVisibleText())
  };
  try{
    const resp = await fetch("http://localhost:8787/advice", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (data?.answer){
      renderAnswer(answerEl, data.answer, data.decision, data.summary);
      STATE.lastAnalysis = { context: body.context, recommendation: { msg: (data.summary || (data.answer||'').split(/(?<=[\.\!\?])\s+/)[0] || (data.answer||'').slice(0,160)) }, details: { extractedRatePct: data?.extracted?.interest_rate_pct ?? null } };
      renderSummary(STATE.lastAnalysis);
    } else {
      answerEl.textContent = "Couldn't get advice. Try reloading the page.";
    }
  } catch(e){
    answerEl.textContent = "Backend not reachable. Start AI backend on :8787";
  }
}

function renderAnswer(container, fullText, decision, serverSummary) {
  // Helper: remove obvious duplicate consecutive blocks (e.g., repeated paragraphs)
  function dedupeText(t){
    if(!t) return t;
    const parts = t.split(/\n{2,}/).map(s=>s.trim()).filter(Boolean);
    const out = [];
    for(const p of parts){
      if(out.length && out[out.length-1] === p) continue;
      out.push(p);
    }
    return out.join("\n\n");
  }
  
  // limit length for initial view
  const limit = 180; // shorter summary by default
  // clean duplicates in full text
  fullText = dedupeText(fullText || '');
  // compute short summary: prefer serverSummary, else first sentence, else truncated
  let shortSummary = '';
  if (serverSummary && serverSummary.trim().length) shortSummary = serverSummary.trim();
  else {
    const firstSent = (fullText||'').split(/(?<=[\.\!\?])\s+/)[0] || '';
    shortSummary = firstSent.length ? firstSent.trim() : (fullText||'').slice(0, limit).trim();
  }
  
  const wrapper = document.createElement('div');
  const summary = document.createElement('div');
  const full = document.createElement('div');
  
  // Create decision element if decision exists
  let decisionEl = null;
  if (decision) {
    decisionEl = document.createElement('div');
    decisionEl.className = 'smart-answer-decision';
    decisionEl.textContent = `— Decision: ${decision}`;
    decisionEl.style.marginTop = '8px';
    decisionEl.style.fontStyle = 'italic';
    decisionEl.style.color = '#6b7280';
    decisionEl.style.display = 'none'; // hidden by default until expanded
  }
  
  if (serverSummary && serverSummary.length > 0) {
    summary.textContent = shortSummary;
    full.textContent = fullText;
    // initial state: show short summary, hide full
    summary.style.display = 'block';
    full.style.display = 'none';
    const btn = document.createElement('button');
    btn.className = 'smart-answer-toggle';
    btn.textContent = 'Show more';
    btn.onclick = () => {
      if (full.style.display === 'none') {
        full.style.display = 'block';
        summary.style.display = 'none';
        btn.textContent = 'Show less';
        // show decision when expanded
        if (decisionEl) decisionEl.style.display = 'block';
        container.scrollIntoView({behavior:'smooth', block:'nearest'});
      } else {
        full.style.display = 'none';
        summary.style.display = 'block';
        btn.textContent = 'Show more';
        // hide decision when collapsed
        if (decisionEl) decisionEl.style.display = 'none';
      }
    };
    wrapper.appendChild(summary);
    wrapper.appendChild(full);
    wrapper.appendChild(btn);
  } else if (fullText.length > limit) {
    summary.textContent = shortSummary.length > 0 ? shortSummary : (fullText.slice(0, limit) + '...');
    full.textContent = fullText;
    // initial state: show summary, hide full
    summary.style.display = 'block';
    full.style.display = 'none';
    const btn = document.createElement('button');
    btn.className = 'smart-answer-toggle';
    btn.textContent = 'Show more';
    btn.onclick = () => {
      if (full.style.display === 'none') {
        full.style.display = 'block';
        summary.style.display = 'none';
        btn.textContent = 'Show less';
        // show decision when expanded
        if (decisionEl) decisionEl.style.display = 'block';
        container.scrollIntoView({behavior:'smooth', block:'nearest'});
      } else {
        full.style.display = 'none';
        summary.style.display = 'block';
        btn.textContent = 'Show more';
        // hide decision when collapsed
        if (decisionEl) decisionEl.style.display = 'none';
      }
    };
    wrapper.appendChild(summary);
    wrapper.appendChild(full);
    wrapper.appendChild(btn);
  } else {
    wrapper.textContent = fullText;
  }
  
  // Add decision element to wrapper if it exists
  if (decisionEl) {
    wrapper.appendChild(decisionEl);
  }
  
  container.innerHTML = '';
  container.appendChild(wrapper);
}

/* Autofill + learning */
function tryAutofill() {
  chrome.storage.sync.get(null, (all)=>{
    const cf = (all.customFields) || {};
  const customCandidates = Object.keys(cf).map(k => ({
    keys: [k.toLowerCase().replace(/[_-]+/g," "), k.toLowerCase()],
    value: cf[k]
  }));
      const candidates = [
      { keys: ["first name","firstname","given name","givenname","fname","first_name"], value: all.firstName },
      { keys: ["last name","lastname","surname","lname","last_name","family name","familyname"], value: all.lastName },
      { keys: ["father name","father's name","fathers name","father","father_name","fathers_name"], value: all.fatherName },
      { keys: ["date of birth","dob","birth date","birthdate"], value: all.dob },
      { keys: ["pan","permanent account number"], value: all.pan },
      { keys: ["email","e-mail"], value: all.email },
      { keys: ["phone","mobile","mobile number","phone number","contact"], value: all.phone },
      { keys: ["aadhaar","aadhar","uidai","aadhaar number","aadhar number"], value: all.aadhaar }
    ].concat(customCandidates);

  const inputs = Array.from(document.querySelectorAll("input,textarea,select"));
  const labelMap = buildLabelMap();

  let filled = 0;
  for (const inp of inputs) {
    const nameAttr = (inp.getAttribute("name") || "").toLowerCase();
    const idAttr = (inp.id || "").toLowerCase();
    const placeholder = (inp.getAttribute("placeholder") || "").toLowerCase();
    const labelTxt = (labelMap.get(inp) || "");
    for (const c of candidates) {
      if (!c.value) continue;
      const hit = c.keys.some(k =>
        nameAttr.includes(k) || idAttr.includes(k) || placeholder.includes(k) || labelTxt.toLowerCase().includes(k)
      );
      if (hit) {
        if (inp.type === "checkbox" || inp.type === "radio") continue;
        inp.focus();
        inp.value = c.value;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
        break;
      }
    }
  }
  alert(filled ? `Filled ${filled} field(s).` : "No matching fields found.");
  });
}

function buildLabelMap(){
  const map = new Map();
  document.querySelectorAll("label").forEach(l => {
    const txt = l.innerText.trim();
    const forId = l.getAttribute("for");
    if (forId) {
      const inp = document.getElementById(forId);
      if (inp) map.set(inp, txt);
    } else {
      const inp = l.querySelector("input,textarea,select");
      if (inp) map.set(inp, txt);
    }
  });
  return map;
}

function observeAndCapture(){
  const labelMap = buildLabelMap();

  const handler = (e) => {
    const inp = e.target;
    if (!inp || !("value" in inp)) return;
    if (inp.type === "password") return;

    const valRaw = (inp.value || "").trim();
    if (!valRaw) return;

    const key = inferKeyForInput(inp, labelMap);
    if (!key) return;

    const val = sanitizeValueForKey(key, valRaw);

    chrome.storage.sync.get(null, (data) => {
      data = data || {};
      const profileKeys = ["firstName","lastName","fatherName","dob","pan","email","phone","aadhaar"];
      if (profileKeys.includes(key)) {
        data[key] = val;
      } else {
        data.customFields = data.customFields || {};
        data.customFields[key] = val;
      }
      chrome.storage.sync.set(data);
      STATE.profile = data;
      showTinyToast(`Saved “${key}”`);
    });
  };

  document.addEventListener("change", handler, true);
  document.addEventListener("blur", handler, true);
  document.addEventListener("input", (e)=>{
    const inp = e.target;
    if (!inp || !("value" in inp)) return;
    const v = (inp.value||"").replace(/\s+/g,"");
    const lbl = inferKeyForInput(inp, labelMap);
    if (lbl === "aadhaar" && v.length === 12) handler(e);
    if (lbl === "pan" && v.length === 10) handler(e);
  }, true);
}

function inferKeyForInput(inp, labelMap){
  const nameAttr = (inp.getAttribute("name")||"").toLowerCase();
  const idAttr   = (inp.id||"").toLowerCase();
  const placeholder = (inp.getAttribute("placeholder")||"").toLowerCase();
  const labelTxt = (labelMap.get(inp)||"").toLowerCase();

  const pool = [nameAttr, idAttr, placeholder, labelTxt].join(" ");
  const known = [
    { key:"firstName", words:["first name","firstname","given name","givenname","fname","first_name"] },
    { key:"lastName",  words:["last name","lastname","surname","lname","last_name","family name","familyname"] },
    { key:"fatherName", words:["father name","father's name","fathers name","father","father_name","fathers_name"] },
    { key:"dob",       words:["date of birth","dob","birth date","birthdate"] },
    { key:"pan",       words:["pan","permanent account number"] },
    { key:"email",     words:["email","e-mail"] },
    { key:"phone",     words:["phone","mobile","mobile number","phone number","contact"] },
    { key:"aadhaar",   words:["aadhaar","aadhar","uidai","aadhaar number","aadhar number"] }
  ];
  for (const k of known){ if (k.words.some(w => pool.includes(w))) return k.key; }
  const guess = (nameAttr || idAttr || labelTxt || placeholder).trim().replace(/\s+/g,"_");
  return guess || null;
}

function sanitizeValueForKey(key, value){
  if (key === "aadhaar") return value.replace(/\s+/g,"");
  return value;
}

function showTinyToast(msg){
  let t = document.getElementById("smart-mvp-toast");
  if (!t){
    t = document.createElement("div"); t.id = "smart-mvp-toast";
    document.documentElement.appendChild(t);
  }
  t.textContent = msg;
  clearTimeout(t._h);
  t._h = setTimeout(()=> t.remove(), 1800);
}

function getVisibleText() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const t = node.textContent.trim();
      if (!t) return NodeFilter.FILTER_REJECT;
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      const style = window.getComputedStyle(node.parentElement);
      if (style && (style.visibility === "hidden" || style.display === "none")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let collected = "";
  while (walker.nextNode() && collected.length < 60000) {
    const t = walker.currentNode.textContent.trim();
    if (t) collected += " " + t;
  }
  return collected.slice(0, 60000).toLowerCase();
}

function detectContext(text) {
  const t = (text||"").toLowerCase();
  const fdWords = ["fixed deposit","fd rate","interest rate","tenure","time deposit"];
  const ccWords = ["credit card","annual fee","welcome bonus","reward points","cashback","lounge access","forex markup"];
  const hasFD = fdWords.some(w => t.includes(w));
  const hasCC = ccWords.some(w => t.includes(w));
  if (hasFD && !hasCC) return "fd";
  if (hasCC && !hasFD) return "credit_card";
  return "general";
}

// Fallback: ensure panel appears even if storage is slow or init failed
setTimeout(()=>{
  try{
    if (!document.getElementById('smart-mvp-panel')){
      console.log('smart-mvp: no panel found, calling ensurePanel fallback');
      ensurePanel();
    }
  }catch(e){ console.warn('smart-mvp fallback ensurePanel failed', e); }
}, 700);
