function normalizeAadhaar(a){ return (a||"").replace(/\s+/g,""); }
function isAadhaar(a){ return /^\d{12}$/.test(normalizeAadhaar(a)); }

function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

function formatPhoneNumber(value) {
  // Format phone number as user types
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length <= 10) {
    return cleaned.replace(/(\d{5})(\d{5})/, '$1 $2');
  }
  return cleaned.replace(/(\d{2})(\d{5})(\d{5})/, '+$1 $2 $3');
}

function formatAadhaar(value) {
  // Format Aadhaar as user types
  const cleaned = value.replace(/\D/g, '');
  return cleaned.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
}

(async ()=>{
  const data = await chrome.storage.sync.get(null);
  document.getElementById("firstName").value = data.firstName||"";
  document.getElementById("lastName").value  = data.lastName||"";
  document.getElementById("fatherName").value = data.fatherName||"";
  document.getElementById("dob").value       = data.dob||"";
  document.getElementById("pan").value       = data.pan||"";
  document.getElementById("email").value     = data.email||"";
  document.getElementById("phone").value     = data.phone||"";
  document.getElementById("aadhaar").value   = data.aadhaar||"";
  
  // Add input formatting
  document.getElementById("phone").addEventListener('input', (e) => {
    e.target.value = formatPhoneNumber(e.target.value);
  });
  
  document.getElementById("aadhaar").addEventListener('input', (e) => {
    e.target.value = formatAadhaar(e.target.value);
  });
})();

document.getElementById("save").addEventListener("click", async ()=>{
  try {
    const existing = await chrome.storage.sync.get(null);
    const data = {
      ...existing,
      firstName: document.getElementById("firstName").value.trim() || "",
      lastName: document.getElementById("lastName").value.trim() || "",
      fatherName: document.getElementById("fatherName").value.trim() || "",
      dob: document.getElementById("dob").value.trim() || "",
      pan: document.getElementById("pan").value.trim().toUpperCase() || "",
      email: document.getElementById("email").value.trim() || "",
      phone: document.getElementById("phone").value.trim() || "",
      aadhaar: document.getElementById("aadhaar").value.trim() || existing.aadhaar || ""
    };
    
    // Validate Aadhaar
    const aa = normalizeAadhaar(data.aadhaar);
    if (aa && !isAadhaar(aa)) {
      showStatus("⚠️ Aadhaar should be 12 digits. Please check and try again.", 'error');
      return;
    }
    data.aadhaar = aa;
    
    // Validate PAN
    if (data.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(data.pan)) {
      showStatus("⚠️ PAN should be in format ABCDE1234F. Please check and try again.", 'error');
      return;
    }
    
    // Validate Email
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      showStatus("⚠️ Please enter a valid email address.", 'error');
      return;
    }
    
    await chrome.storage.sync.set(data);
    showStatus("✅ Personal details saved successfully!", 'success');
  } catch (error) {
    showStatus("❌ Failed to save details. Please try again.", 'error');
    console.error('Save error:', error);
  }
});

document.getElementById("testFill").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showStatus("❌ No active tab found.", 'error');
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "MVP_TEST_AUTOFILL" });
    showStatus("🧪 Autofill test sent to current page!", 'success');
  } catch (error) {
    showStatus("❌ Failed to send autofill test.", 'error');
    console.error('Test fill error:', error);
  }
});

document.getElementById("loadDemo").addEventListener("click", async ()=>{
  try {
    const resp = await fetch(chrome.runtime.getURL("profile.json"));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const profile = await resp.json();
    await chrome.storage.sync.set({ demoProfileV3: profile });
    showStatus("✅ Demo financial profile loaded successfully!", 'success');
  } catch (error) {
    showStatus("❌ Failed to load demo profile.", 'error');
    console.error('Load demo error:', error);
  }
});

document.getElementById("viewProfile").addEventListener("click", async ()=>{
  try {
    const { demoProfileV3 } = await chrome.storage.sync.get("demoProfileV3");
    if (!demoProfileV3) {
      showStatus("⚠️ No demo profile found. Load it first.", 'error');
      return;
    }
    const win = window.open("", "_blank", "width=600,height=700,scrollbars=yes");
    win.document.write(`
      <html>
        <head>
          <title>Demo Financial Profile</title>
          <style>
            body { font-family: 'Courier New', monospace; margin: 20px; background: #f8f9fa; }
            pre { background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; overflow: auto; }
            h1 { color: #495057; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>📊 Demo Financial Profile</h1>
          <pre>${JSON.stringify(demoProfileV3, null, 2)}</pre>
        </body>
      </html>
    `);
    showStatus("👁️ Profile opened in new window!", 'success');
  } catch (error) {
    showStatus("❌ Failed to open profile.", 'error');
    console.error('View profile error:', error);
  }
});
