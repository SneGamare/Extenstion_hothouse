
async function get(tabId) {
  return new Promise(res => chrome.storage.sync.get(null, res));
}

document.getElementById("save").addEventListener("click", async () => {
  const data = {
    firstName: document.getElementById("firstName").value || "",
    lastName: document.getElementById("lastName").value || "",
    dob: document.getElementById("dob").value || "",
    pan: document.getElementById("pan").value || "",
    email: document.getElementById("email").value || "",
    phone: document.getElementById("phone").value || "",
    demoPortfolio: {
      fd_rate_pct: 7.2,
      fd_tenure_months: 12,
      spend_profile: { online: 0.4, travel: 0.3, dining: 0.3, monthly_spend_inr: 60000 }
    }
  };
  await chrome.storage.sync.set(data);
  alert("Saved!");
});

document.getElementById("testFill").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "MVP_TEST_AUTOFILL" });
});
