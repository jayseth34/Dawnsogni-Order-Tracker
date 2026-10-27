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

## Run locally

Open `index.html`, or serve the folder:

```bash
python -m http.server 5174
```
