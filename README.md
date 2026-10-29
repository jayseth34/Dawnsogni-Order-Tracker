# Dawn Sogni — Order Tracker

A small order tracker in the Dawn Sogni black-and-white style. It runs entirely in the browser: no backend, no login. Orders are saved in this browser's `localStorage`.

**Live:** https://jayseth34.github.io/Dawnsogni-Order-Tracker/

## Features

- Active / Delivered / Payment due / All views, plus search
- Auto-generated order codes (`DS-0001`, `DS-0002`, …), editable
- Line items with size, qty and price; shipping and discount; auto total
- Multiple payments per order (UPI, cash, bank, card) with paid / balance tracking
- Status flow: Order placed → In production → Ready → Out for delivery → Delivered (or Cancelled)
- Notes on every order
- **WhatsApp "out for delivery"** button: opens WhatsApp with a ready message to the customer and marks the order out for delivery. Disabled when the order has no number.
- Dashboard totals: active, delivered, order value, collected, pending payments
- Backup: export / import JSON, export CSV for Excel

## WhatsApp sending

The button uses a `wa.me` link, so WhatsApp sends from **whichever account is logged in on the device** you click it from. Open the tracker on the phone (or WhatsApp Web) signed in as the business number 9920279905. The message template can be edited in Settings.

Fully automatic sending (no tap needed) would require the WhatsApp Business Cloud API and a server, which this browser-only app deliberately avoids.

## Data

Everything lives in the browser you use. Clearing site data, or switching browser/device, means starting empty, so use **Settings → Export backup** regularly and **Import backup** on a new device.

## Updates and safety

When a new version is published, the app shows a popup with a one-tap **Download backup** button:

- If the page is open when you push, it notices within 5 minutes (or as soon as you come back to the tab) and offers **Download backup → Update now**.
- The first time the updated version opens, it shows what's new and offers a backup again.

Saved orders carry a data-format version (`DATA_VERSION` in `app.js`). If the order format ever changes, add a step to `MIGRATIONS`; old data is upgraded on load (an untouched copy is kept in the browser first) and old backups are upgraded on import.

### Releasing an update

1. Make your changes.
2. Bump the version in **three** places to the same number (e.g. `1.2.0`):
   - `version.json` → `"version"` (and update `"notes"`, shown in the popup)
   - `index.html` → `styles.css?v=…`
   - `index.html` → `app.js?v=…`
3. Commit and push to `main`. GitHub Pages redeploys in about a minute.

## Run locally

Open `index.html`, or serve the folder:

```bash
python -m http.server 5174
```
