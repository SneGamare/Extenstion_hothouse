# Smart Autofill + Finance Nudge (MVP v2)
Features:
- Save basics + Aadhaar in popup
- Add any **custom field** (key/value) in popup; delete/edit supported
- **Autofill** fills basics + Aadhaar + all custom fields by label/name/id/placeholder match
- **Auto-learn**: as you type, values are saved (known keys update profile; others become custom fields)
- FD/Card page detection + simple FD rate comparison vs demo portfolio

Install:
1. Open `chrome://extensions`, enable Developer mode.
2. Click **Load unpacked** and select this folder.
3. Open popup, save your details and add any custom fields.
4. On forms, click **Autofill Basics**; typing will also be learned automatically.

Notes:
- Data stored in chrome.storage.sync for demo. For sensitive info, prefer chrome.storage.local and/or add a lock.
- LLM hooks can be added later where analyzePage() runs.
