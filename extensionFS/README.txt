# Smart Autofill + Finance Nudge (MVP)
This Chrome MV3 extension demonstrates:
- Basic autofill for First/Last Name, DOB, PAN, Email, Phone
- Detecting FD/Credit Card pages via simple keywords
- Extracting an FD interest rate by regex and comparing to a mock portfolio (existing FD @ 7.2%)
- Showing a floating panel with a rule-based recommendation

## How to load in Chrome
1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `extension-mvp` folder.
4. Pin the extension. Click it to open the popup, enter your profile, and **Save**.
5. Visit any bank/fintech product page. A floating panel will appear.
6. Click **Autofill Basics** to try filling fields.
7. The panel will show the detected context and a simple recommendation for FD pages.

## Notes
- This is a local, minimal demo. No real data aggregator/LLM calls.
- To integrate an LLM, wire an API in `content.js` → `analyzePage()` where the TODO is placed.
- To integrate Account Aggregator/INDmoney, save the profile server-side and return only needed fields to the extension.
