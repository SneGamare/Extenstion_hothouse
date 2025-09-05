
// Very lightweight MVP content script.
// - Reads page text
// - Detects context (FD vs Credit Card) via keywords
// - Extracts likely FD interest rate from text
// - Compares to mock portfolio and shows a panel
// - Autofills basic fields by label/name heuristics

const STATE = {
  profile: null,
  panel: null,
  lastAnalysis: null
};

// Load profile from storage
chrome.storage.sync.get(null, (data) => {
  STATE.profile = data || {};
  ensurePanel();
  analyzePage();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "MVP_TEST_AUTOFILL") {
    tryAutofill();
  }
});

function ensurePanel() {
  if (document.getElementById("smart-mvp-panel")) return;
  const panel = document.createElement("div");
  panel.id = "smart-mvp-panel";
  panel.innerHTML = `
    <header>
      <div>Smart Autofill • Demo</div>
      <button id="smart-mvp-close" title="Close">×</button>
    </header>
    <div class="body">
      <div id="smart-mvp-summary">Scanning this page…</div>
      <div class="row">
        <button id="smart-mvp-fill">Autofill Basics</button>
        <button id="smart-mvp-why">Why?</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(panel);
  document.getElementById("smart-mvp-close").onclick = () => panel.remove();
  document.getElementById("smart-mvp-fill").onclick = () => tryAutofill();
  document.getElementById("smart-mvp-why").onclick = () => showWhy();
  STATE.panel = panel;
}

function analyzePage() {
  const text = getVisibleText();
  const context = detectContext(text);
  const result = { context, recommendation: null, details: {} };

  if (context === "fd") {
    const rate = extractFdRate(text); // % number
    result.details.extractedRatePct = rate;

    const existing = STATE.profile?.demoPortfolio?.fd_rate_pct ?? 7.2;
    const delta = rate != null ? (rate - existing) : null;

    if (rate == null) {
      result.recommendation = { tag: "info", msg: "FD page detected, but couldn't find a clear interest rate." };
    } else if (delta >= 0.25) {
      result.recommendation = { tag: "good", msg: `Better FD rate detected: ${rate}% vs your ${existing}% → Consider switching.` };
    } else if (delta <= -0.25) {
      result.recommendation = { tag: "warn", msg: `Worse FD rate: ${rate}% vs your ${existing}% → Likely skip.` };
    } else {
      result.recommendation = { tag: "info", msg: `Similar FD rate: ${rate}% vs your ${existing}% → Neutral.` };
    }
  } else if (context === "credit_card") {
    // MVP: just detect and show a placeholder message based on mock spend.
    result.recommendation = { tag: "info", msg: "Credit Card page detected. Compare reward rates to your spend profile for a decision." };
  } else {
    result.recommendation = { tag: "info", msg: "Browsing… No specific finance context detected yet." };
  }

  STATE.lastAnalysis = result;
  renderSummary(result);
}

function renderSummary(result) {
  const el = document.getElementById("smart-mvp-summary");
  if (!el) return;
  const { context, recommendation, details } = result;
  const pill = context === "fd" ? "FD" : (context === "credit_card" ? "Credit Card" : "General");
  const tagClass = recommendation?.tag === "good" ? "good" : (recommendation?.tag === "warn" ? "warn" : "");

  el.innerHTML = `
    <div class="pill ${tagClass}">${pill}</div>
    <div style="margin-top:6px">${recommendation?.msg || ""}</div>
    ${details?.extractedRatePct != null ? `<div style="margin-top:6px; font-size:12px; color:#555">Detected FD rate: <b>${details.extractedRatePct}%</b></div>` : ""}
  `;
}

function showWhy() {
  const res = STATE.lastAnalysis;
  if (!res) return;
  const lines = [];
  lines.push(`Context: ${res.context}`);
  if (res.context === "fd") {
    lines.push(`Extracted rate: ${res.details.extractedRatePct ?? "N/A"}%`);
    const existing = STATE.profile?.demoPortfolio?.fd_rate_pct ?? 7.2;
    lines.push(`Your existing FD: ${existing}%`);
    lines.push(`Rule: if new_rate >= existing + 0.25% ⇒ suggest switching; if <= existing - 0.25% ⇒ suggest skipping.`);
    lines.push(`(This is a rules demo. An LLM would generate the narrative using these numbers.)`);
  } else if (res.context === "credit_card") {
    lines.push(`Rule placeholder: compute effective reward rate vs your spend mix, fees, and milestones.`);
  }
  alert(lines.join("\n"));
}

function tryAutofill() {
  const p = STATE.profile || {};
  const candidates = [
    { keys: ["first name","firstname","given name","givenname","fname","first_name"], value: p.firstName },
    { keys: ["last name","lastname","surname","lname","last_name","family name","familyname"], value: p.lastName },
    { keys: ["date of birth","dob","birth date","birthdate"], value: p.dob },
    { keys: ["pan"], value: p.pan },
    { keys: ["email","e-mail"], value: p.email },
    { keys: ["phone","mobile","mobile number","phone number","contact"], value: p.phone }
  ];

  const inputs = Array.from(document.querySelectorAll("input,textarea,select"));
  // Map labels to inputs
  const labelMap = new Map();
  document.querySelectorAll("label").forEach(l => {
    const txt = l.innerText.trim().toLowerCase();
    const forId = l.getAttribute("for");
    if (forId) {
      const inp = document.getElementById(forId);
      if (inp) labelMap.set(inp, txt);
    } else {
      // nested input
      const inp = l.querySelector("input,textarea,select");
      if (inp) labelMap.set(inp, txt);
    }
  });

  let filled = 0;

  for (const inp of inputs) {
    const nameAttr = (inp.getAttribute("name") || "").toLowerCase();
    const idAttr = (inp.id || "").toLowerCase();
    const placeholder = (inp.getAttribute("placeholder") || "").toLowerCase();
    const labelTxt = (labelMap.get(inp) || "");

    for (const c of candidates) {
      if (!c.value) continue;
      const hit = c.keys.some(k =>
        nameAttr.includes(k) || idAttr.includes(k) || placeholder.includes(k) || labelTxt.includes(k)
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
}

function getVisibleText() {
  // Grab a slice of visible text for quick heuristics (keep it small to avoid perf issues)
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
  let count = 0;
  while (walker.nextNode() && collected.length < 50000) {
    const t = walker.currentNode.textContent.trim();
    if (t) {
      collected += " " + t;
      count++;
    }
  }
  return collected.slice(0, 50000).toLowerCase();
}

function detectContext(text) {
  const fdWords = ["fixed deposit","fd rate","interest rate","tenure","rd","time deposit"];
  const ccWords = ["credit card","annual fee","welcome bonus","reward points","cashback","lounge access","forex markup"];
  const hasFD = fdWords.some(w => text.includes(w));
  const hasCC = ccWords.some(w => text.includes(w));
  if (hasFD && !hasCC) return "fd";
  if (hasCC && !hasFD) return "credit_card";
  // If both or neither, return general
  return "general";
}

function extractFdRate(text) {
  // Heuristic: find patterns like 7.5%, 7.50 %, 7.50% p.a.
  const re = /(\d{1,2}(?:\.\d{1,2})?)\s*%/g;
  let m, rates = [];
  while ((m = re.exec(text)) !== null) {
    const val = parseFloat(m[1]);
    if (!isNaN(val) && val > 0 && val < 25) rates.push(val);
    if (rates.length > 10) break;
  }
  if (rates.length === 0) return null;
  // Simple heuristic: choose the highest visible rate (many banks advertise highest)
  return Math.max(...rates);
}

// TODO (LLM integration):
// - Instead of analyzePage() doing heuristics, send {url, snippet} to your backend.
// - Backend uses an LLM to parse a structured product JSON, runs rules, returns a recommendation.
// - Render that recommendation here.
