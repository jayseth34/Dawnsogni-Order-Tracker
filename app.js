(() => {
  "use strict";

  // ---------- Storage (browser only) ----------
  const ORDERS_KEY = "ds-tracker:orders";
  const SETTINGS_KEY = "ds-tracker:settings";

  // One WhatsApp message per order status.
  const DEFAULT_TEMPLATES = {
    pending:
      "Hi {name}! 🖤\n\nThank you for ordering with Dawn Sogni. Your order *{code}* is confirmed.\n\nItems: {items}\nTotal: {total}\nPaid: {paid}\nBalance due: {balance}\n\nWe'll keep you posted at every step.",
    production:
      "Hi {name}! ✂️\n\nYour Dawn Sogni order *{code}* is now in production. We'll message you as soon as it's ready.",
    ready:
      "Hi {name}! ✨\n\nGood news, your Dawn Sogni order *{code}* is ready.\n\nItems: {items}\nBalance due: {balance}\n\nWe'll share delivery details shortly.",
    out:
      "Hi {name}! ✨\n\nYour Dawn Sogni order *{code}* is out for delivery and will reach you soon.\n\nItems: {items}\nTotal: {total}\nBalance due: {balance}\n\nThank you for shopping with Dawn Sogni 🖤",
    delivered:
      "Hi {name}! 🖤\n\nYour Dawn Sogni order *{code}* has been delivered. We hope you love it!\n\nTag @dawn.sogni on Instagram when you wear it, we'd love to see.",
    cancelled:
      "Hi {name},\n\nYour Dawn Sogni order *{code}* has been cancelled. If you have any questions, just reply to this message."
  };

  const DEFAULT_SETTINGS = {
    senderPhone: "9920279905",
    codePrefix: "DS-",
    nextSeq: 1,
    templates: DEFAULT_TEMPLATES
  };

  const STATUSES = [
    { key: "pending", label: "Order placed" },
    { key: "production", label: "In production" },
    { key: "ready", label: "Ready" },
    { key: "out", label: "Out for delivery" },
    { key: "delivered", label: "Delivered" },
    { key: "cancelled", label: "Cancelled" }
  ];
  const statusLabel = (k) => (STATUSES.find((s) => s.key === k) || STATUSES[0]).label;
  const isClosed = (o) => o.status === "delivered" || o.status === "cancelled";

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      toast("Could not save — browser storage is full or blocked");
    }
  }

  // ---------- Versions ----------
  // App version comes from the ?v= on this script's tag in index.html (kept in sync with version.json).
  const APP_VERSION = (document.currentScript && new URL(document.currentScript.src).searchParams.get("v")) || "0.0.0";
  const SEEN_VERSION_KEY = "ds-tracker:seenVersion";

  // Format of the saved orders. When it changes, bump DATA_VERSION and add a step that
  // converts version N-1 into N; old data is upgraded on load, and backups on import.
  const DATA_VERSION = 1;
  const DATA_VERSION_KEY = "ds-tracker:dataVersion";
  const MIGRATIONS = {
    // 2: (orders) => orders.map((o) => ({ ...o, courier: o.courier || "" })),
  };

  function migrate(list, fromVersion) {
    let data = list;
    for (let v = (fromVersion || 1) + 1; v <= DATA_VERSION; v++) {
      if (MIGRATIONS[v]) data = MIGRATIONS[v](data);
    }
    return data;
  }

  function migrateStoredOrders() {
    try {
      const from = parseInt(localStorage.getItem(DATA_VERSION_KEY) || "1", 10);
      if (from < DATA_VERSION) {
        const raw = localStorage.getItem(ORDERS_KEY);
        // Keep an untouched copy so a bad migration can be undone.
        if (raw) localStorage.setItem(`ds-tracker:before-data-v${DATA_VERSION}`, raw);
        localStorage.setItem(ORDERS_KEY, JSON.stringify(migrate(raw ? JSON.parse(raw) : [], from)));
      }
      localStorage.setItem(DATA_VERSION_KEY, String(DATA_VERSION));
    } catch {
      // Storage blocked or unreadable; the app falls back to an empty list.
    }
  }

  const cmpVersion = (a, b) => {
    const pa = String(a).split(".").map(Number);
    const pb = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return Math.sign(d);
    }
    return 0;
  };

  migrateStoredOrders();
  let orders = load(ORDERS_KEY, []);
  function normalizeSettings(saved) {
    const s = { ...DEFAULT_SETTINGS, ...saved };
    s.templates = { ...DEFAULT_TEMPLATES, ...(saved && saved.templates) };
    // Up to 1.1.0 there was a single "out for delivery" template.
    if (s.template) s.templates.out = s.template;
    delete s.template;
    return s;
  }

  let settings = normalizeSettings(load(SETTINGS_KEY, {}));
  save(SETTINGS_KEY, settings);
  const persistOrders = () => save(ORDERS_KEY, orders);
  const persistSettings = () => save(SETTINGS_KEY, settings);

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmtDate = (d) => {
    if (!d) return "";
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  function subtotal(o) {
    return (o.items || []).reduce((s, i) => s + num(i.qty) * num(i.price), 0);
  }
  function total(o) {
    return Math.max(0, subtotal(o) + num(o.shipping) - num(o.discount));
  }
  function paid(o) {
    return (o.payments || []).reduce((s, p) => s + num(p.amount), 0);
  }
  function balance(o) {
    return total(o) - paid(o);
  }
  function itemsText(o) {
    return (o.items || [])
      .filter((i) => i.name)
      .map((i) => `${i.name}${i.size ? ` (${i.size})` : ""}${num(i.qty) > 1 ? ` ×${num(i.qty)}` : ""}`)
      .join(", ");
  }

  // Indian numbers: accept 10 digits, 0-prefixed, or +91. Returns digits for wa.me or "".
  function waNumber(phone) {
    let d = String(phone || "").replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (d.length === 10) d = "91" + d;
    return d.length >= 11 && d.length <= 15 ? d : "";
  }

  function nextCode() {
    const used = new Set(orders.map((o) => o.code.toUpperCase()));
    let seq = settings.nextSeq || 1;
    let code;
    do {
      code = `${settings.codePrefix}${String(seq).padStart(4, "0")}`;
      seq++;
    } while (used.has(code.toUpperCase()));
    return code;
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  // ---------- Rendering ----------
  let currentTab = "active";
  let query = "";

  function matchesTab(o) {
    if (currentTab === "active") return !isClosed(o);
    if (currentTab === "delivered") return o.status === "delivered";
    if (currentTab === "dues") return o.status !== "cancelled" && balance(o) > 0;
    return true;
  }
  function matchesQuery(o) {
    if (!query) return true;
    const hay = [o.code, o.customer, o.phone, o.address, o.notes, itemsText(o), statusLabel(o.status)].join(" ").toLowerCase();
    return hay.includes(query);
  }

  function renderStats() {
    const live = orders.filter((o) => o.status !== "cancelled");
    const active = orders.filter((o) => !isClosed(o)).length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const revenue = live.reduce((s, o) => s + total(o), 0);
    const collected = live.reduce((s, o) => s + paid(o), 0);
    const due = live.reduce((s, o) => s + Math.max(0, balance(o)), 0);
    const cards = [
      ["Active orders", active],
      ["Delivered", delivered],
      ["Order value", inr(revenue)],
      ["Collected", inr(collected)],
      ["Pending payments", inr(due)]
    ];
    $("#stats").innerHTML = cards
      .map(([l, v]) => `<div class="stat"><div class="statLabel">${l}</div><div class="statValue">${v}</div></div>`)
      .join("");
  }

  function renderTabs() {
    const counts = {
      active: orders.filter((o) => !isClosed(o)).length,
      delivered: orders.filter((o) => o.status === "delivered").length,
      dues: orders.filter((o) => o.status !== "cancelled" && balance(o) > 0).length,
      all: orders.length
    };
    $$("#tabs .tab").forEach((t) => {
      const k = t.dataset.tab;
      t.classList.toggle("active", k === currentTab);
      const base = t.textContent.replace(/\s*\d+$/, "");
      t.innerHTML = `${base}<span class="count">${counts[k]}</span>`;
    });
  }

  function orderCard(o) {
    const tot = total(o);
    const bal = balance(o);
    const pay =
      o.status === "cancelled"
        ? ""
        : bal <= 0
          ? `<span class="badge paid">Paid</span>`
          : paid(o) > 0
            ? `<span class="badge due">Part paid</span>`
            : `<span class="badge due">Unpaid</span>`;
    const late = !isClosed(o) && o.dueDate && o.dueDate < today() ? `<span class="badge late">Overdue</span>` : "";
    const canWa = !!waNumber(o.phone);
    const sent = o.notified && o.notified[o.status] ? `<span class="badge sent">✓ WhatsApp sent</span>` : "";
    const meta = [
      itemsText(o) || "No items added",
      o.phone ? esc(o.phone) : "No WhatsApp number",
      `Ordered ${fmtDate(o.orderDate)}`,
      o.dueDate ? `Due ${fmtDate(o.dueDate)}` : "",
      o.deliveredAt ? `Delivered ${fmtDate(o.deliveredAt)}` : ""
    ]
      .filter(Boolean)
      .map((s, i) => (i === 0 ? esc(s) : s))
      .join(" · ");

    return `
      <article class="orderCard" data-id="${o.id}">
        <div>
          <div class="orderTop">
            <span class="code">${esc(o.code)}</span>
            <span class="customer">${esc(o.customer)}</span>
            <span class="badge s-${o.status}">${statusLabel(o.status)}</span>
            ${pay}${late}${sent}
          </div>
          <div class="orderMeta">${meta}</div>
          ${o.notes ? `<div class="orderNotes">📝 ${esc(o.notes)}</div>` : ""}
        </div>
        <div class="money">
          <b>${inr(tot)}</b><br />
          <span class="muted">Paid ${inr(paid(o))}</span>${
            bal > 0 && o.status !== "cancelled" ? ` · <span style="color:var(--warn)">Due ${inr(bal)}</span>` : ""
          }
        </div>
        <div class="orderActions">
          <select class="input small statusSelect" data-act="status" aria-label="Change status">
            ${STATUSES.map((s) => `<option value="${s.key}" ${s.key === o.status ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
          <button class="btn small wa" data-act="wa" ${canWa ? "" : "disabled"} title="${
            canWa ? `Send the '${statusLabel(o.status)}' message on WhatsApp` : "Add a WhatsApp number to enable"
          }">WhatsApp</button>
          <button class="btn small" data-act="edit">Edit</button>
        </div>
      </article>`;
  }

  function renderList() {
    const list = orders
      .filter((o) => matchesTab(o) && matchesQuery(o))
      .sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || "") || b.createdAt - a.createdAt);
    const el = $("#orderList");
    if (!list.length) {
      const msg = orders.length
        ? "No orders match this view."
        : "No orders yet. Tap <b>+ New order</b> to add your first one.";
      el.innerHTML = `<div class="empty">${msg}</div>`;
      return;
    }
    el.innerHTML = list.map(orderCard).join("");
  }

  function render() {
    renderStats();
    renderTabs();
    renderList();
  }

  // ---------- Order dialog ----------
  const dialog = $("#orderDialog");
  const form = $("#orderForm");
  let editingId = null;

  form.status.innerHTML = STATUSES.map((s) => `<option value="${s.key}">${s.label}</option>`).join("");

  function addRow(wrap, tplId, data = {}) {
    const node = $(tplId).content.firstElementChild.cloneNode(true);
    $$("[data-k]", node).forEach((inp) => {
      if (data[inp.dataset.k] !== undefined) inp.value = data[inp.dataset.k];
    });
    wrap.appendChild(node);
    return node;
  }
  function readRows(wrap) {
    return $$(".lineRow", wrap).map((row) => {
      const obj = {};
      $$("[data-k]", row).forEach((inp) => (obj[inp.dataset.k] = inp.value.trim()));
      return obj;
    });
  }

  function readForm() {
    const items = readRows($("#itemsWrap"))
      .filter((i) => i.name || num(i.price))
      .map((i) => ({ name: i.name, size: i.size, qty: Math.max(1, num(i.qty) || 1), price: num(i.price) }));
    const payments = readRows($("#paymentsWrap"))
      .filter((p) => num(p.amount))
      .map((p) => ({ date: p.date || today(), amount: num(p.amount), mode: p.mode, ref: p.ref }));
    return {
      code: form.code.value.trim(),
      orderDate: form.orderDate.value,
      customer: form.customer.value.trim(),
      phone: form.phone.value.trim(),
      address: form.address.value.trim(),
      items,
      shipping: num(form.shipping.value),
      discount: num(form.discount.value),
      payments,
      status: form.status.value,
      dueDate: form.dueDate.value,
      notes: form.notes.value.trim()
    };
  }

  function updateTotals() {
    const o = readForm();
    $("#formTotal").textContent = inr(total(o));
    const bal = balance(o);
    $("#formBalance").innerHTML =
      `Paid <b>${inr(paid(o))}</b> · ` +
      (bal > 0 ? `<span style="color:var(--warn)">Balance due <b>${inr(bal)}</b></span>` : `<span style="color:var(--ok)">Fully paid</span>`);
  }

  function openOrder(o) {
    editingId = o ? o.id : null;
    form.reset();
    $("#itemsWrap").innerHTML = "";
    $("#paymentsWrap").innerHTML = "";
    $("#dialogEyebrow").textContent = o ? o.code : "New order";
    $("#dialogTitle").textContent = o ? "Edit order" : "Create order";
    $("#deleteOrderBtn").style.visibility = o ? "visible" : "hidden";

    const d = o || { code: nextCode(), orderDate: today(), status: "pending", shipping: 0, discount: 0, items: [{}], payments: [] };
    form.code.value = d.code;
    form.orderDate.value = d.orderDate || today();
    form.customer.value = d.customer || "";
    form.phone.value = d.phone || "";
    form.address.value = d.address || "";
    form.shipping.value = d.shipping || 0;
    form.discount.value = d.discount || 0;
    form.status.value = d.status || "pending";
    form.dueDate.value = d.dueDate || "";
    form.notes.value = d.notes || "";
    (d.items && d.items.length ? d.items : [{}]).forEach((i) => addRow($("#itemsWrap"), "#itemRowTpl", i));
    (d.payments || []).forEach((p) => addRow($("#paymentsWrap"), "#paymentRowTpl", p));
    updateTotals();
    dialog.showModal();
    if (!o) form.customer.focus();
  }

  form.addEventListener("input", updateTotals);
  $("#addItemBtn").addEventListener("click", () => addRow($("#itemsWrap"), "#itemRowTpl").querySelector("input").focus());
  $("#addPaymentBtn").addEventListener("click", () => {
    const o = readForm();
    const row = addRow($("#paymentsWrap"), "#paymentRowTpl", { date: today(), amount: Math.max(0, balance(o)) || "" });
    row.querySelector('[data-k="amount"]').focus();
    updateTotals();
  });
  dialog.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) {
      rm.closest(".lineRow").remove();
      updateTotals();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = readForm();
    if (!data.code || !data.customer) return;
    const clash = orders.find((o) => o.code.toUpperCase() === data.code.toUpperCase() && o.id !== editingId);
    if (clash) {
      toast(`Code ${data.code} is already used by ${clash.customer}`);
      form.code.focus();
      return;
    }
    let saved;
    let statusChanged;
    if (editingId) {
      saved = orders.find((x) => x.id === editingId);
      statusChanged = data.status !== saved.status;
      if (data.status === "delivered" && saved.status !== "delivered") data.deliveredAt = today();
      if (data.status !== "delivered") data.deliveredAt = "";
      Object.assign(saved, data, { updatedAt: Date.now() });
      toast("Order updated");
    } else {
      saved = { id: uid(), createdAt: Date.now(), updatedAt: Date.now(), ...data };
      statusChanged = true;
      if (saved.status === "delivered") saved.deliveredAt = today();
      orders.push(saved);
      // Advance the counter past auto-generated codes.
      const m = data.code.match(/(\d+)$/);
      if (data.code.startsWith(settings.codePrefix) && m) settings.nextSeq = Math.max(settings.nextSeq, parseInt(m[1], 10) + 1);
      persistSettings();
      toast(`Order ${saved.code} created`);
    }
    persistOrders();
    dialog.close();
    render();
    if (statusChanged && waNumber(saved.phone)) openNotify(saved);
  });

  $("#deleteOrderBtn").addEventListener("click", () => {
    const o = orders.find((x) => x.id === editingId);
    if (!o || !confirm(`Delete order ${o.code} for ${o.customer}? This cannot be undone.`)) return;
    orders = orders.filter((x) => x.id !== editingId);
    persistOrders();
    dialog.close();
    render();
    toast("Order deleted");
  });

  $$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  // ---------- WhatsApp ----------
  function buildMessage(o) {
    const bal = balance(o);
    return (settings.templates[o.status] || DEFAULT_TEMPLATES[o.status] || "")
      .replaceAll("{name}", o.customer.split(" ")[0] || o.customer)
      .replaceAll("{code}", o.code)
      .replaceAll("{items}", itemsText(o) || "-")
      .replaceAll("{total}", inr(total(o)))
      .replaceAll("{paid}", inr(paid(o)))
      .replaceAll("{balance}", bal > 0 ? inr(bal) : "₹0 (fully paid)")
      .replaceAll("{status}", statusLabel(o.status));
  }

  // Preview the message for the order's current status; it can be tweaked before sending.
  const notifyDialog = $("#notifyDialog");
  let notifyOrder = null;

  function openNotify(o) {
    notifyOrder = o;
    $("#notifyTitle").textContent = `Send "${statusLabel(o.status)}" message?`;
    $("#notifyTo").textContent = `To ${o.customer} · ${o.phone}`;
    $("#notifyText").value = buildMessage(o);
    notifyDialog.showModal();
  }

  $("#notifySendBtn").addEventListener("click", () => {
    const o = notifyOrder;
    const n = o && waNumber(o.phone);
    if (!n) return notifyDialog.close();
    window.open(`https://wa.me/${n}?text=${encodeURIComponent($("#notifyText").value)}`, "_blank", "noopener");
    o.notified = { ...o.notified, [o.status]: Date.now() };
    persistOrders();
    notifyDialog.close();
    render();
  });

  function setStatus(o, status) {
    if (o.status === status) return;
    o.status = status;
    o.deliveredAt = status === "delivered" ? today() : "";
    o.updatedAt = Date.now();
    persistOrders();
    render();
    toast(`${o.code}: ${statusLabel(status)}${status === "delivered" && balance(o) > 0 ? ` · ${inr(balance(o))} still due` : ""}`);
    if (waNumber(o.phone)) openNotify(o);
  }

  // ---------- List interactions ----------
  $("#orderList").addEventListener("click", (e) => {
    const card = e.target.closest(".orderCard");
    if (!card) return;
    const o = orders.find((x) => x.id === card.dataset.id);
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "wa") return openNotify(o);
    if (act === "status") return;
    if (e.target.closest("button")?.disabled) return;
    openOrder(o);
  });
  $("#orderList").addEventListener("change", (e) => {
    if (e.target.dataset.act !== "status") return;
    const o = orders.find((x) => x.id === e.target.closest(".orderCard").dataset.id);
    setStatus(o, e.target.value);
  });

  $("#tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    currentTab = t.dataset.tab;
    render();
  });
  $("#search").addEventListener("input", (e) => {
    query = e.target.value.trim().toLowerCase();
    renderList();
  });
  $("#newOrderBtn").addEventListener("click", () => openOrder(null));

  // ---------- Settings & backup ----------
  const settingsDialog = $("#settingsDialog");
  const sForm = $("#settingsForm");
  $("#settingsBtn").addEventListener("click", () => {
    sForm.senderPhone.value = settings.senderPhone;
    sForm.codePrefix.value = settings.codePrefix;
    draftTemplates = { ...settings.templates };
    sForm.templateStatus.value = "out";
    sForm.template.value = draftTemplates.out;
    $("#appVersion").textContent = `Version ${APP_VERSION}`;
    settingsDialog.showModal();
  });

  // One textarea edits whichever status is picked; edits are kept until Save.
  let draftTemplates = {};
  sForm.templateStatus.innerHTML = STATUSES.map((s) => `<option value="${s.key}">${s.label}</option>`).join("");
  sForm.templateStatus.addEventListener("change", () => {
    sForm.template.value = draftTemplates[sForm.templateStatus.value];
  });
  sForm.template.addEventListener("input", () => {
    draftTemplates[sForm.templateStatus.value] = sForm.template.value;
  });
  $("#resetTemplateBtn").addEventListener("click", () => {
    const k = sForm.templateStatus.value;
    draftTemplates[k] = sForm.template.value = DEFAULT_TEMPLATES[k];
  });

  sForm.addEventListener("submit", (e) => {
    e.preventDefault();
    settings.senderPhone = sForm.senderPhone.value.trim();
    settings.codePrefix = sForm.codePrefix.value.trim() || DEFAULT_SETTINGS.codePrefix;
    for (const s of STATUSES) settings.templates[s.key] = (draftTemplates[s.key] || "").trim() || DEFAULT_TEMPLATES[s.key];
    persistSettings();
    settingsDialog.close();
    toast("Settings saved");
  });

  function download(name, content, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportBackup() {
    const payload = {
      app: "dawnsogni-order-tracker",
      version: 1,
      appVersion: APP_VERSION,
      dataVersion: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      settings,
      orders
    };
    download(`dawnsogni-orders-${today()}.json`, JSON.stringify(payload, null, 2), "application/json");
  }
  $("#exportJsonBtn").addEventListener("click", exportBackup);

  $("#exportCsvBtn").addEventListener("click", () => {
    const cols = ["Code", "Order date", "Customer", "Phone", "Address", "Items", "Status", "Due date", "Delivered on", "Total", "Paid", "Balance", "Notes"];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = orders.map((o) =>
      [o.code, o.orderDate, o.customer, o.phone, o.address, itemsText(o), statusLabel(o.status), o.dueDate, o.deliveredAt, total(o), paid(o), balance(o), o.notes]
        .map(cell)
        .join(",")
    );
    download(`dawnsogni-orders-${today()}.csv`, "﻿" + [cols.map(cell).join(","), ...rows].join("\r\n"), "text/csv");
  });

  $("#importInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data) && !Array.isArray(data.orders)) throw new Error("bad file");
      if (data.dataVersion > DATA_VERSION) return toast("This backup is from a newer version — reload the page first");
      const incoming = migrate(Array.isArray(data) ? data : data.orders, data.dataVersion || 1);
      const replace = confirm(
        `Import ${incoming.length} orders.\n\nOK = replace all current orders (${orders.length})\nCancel = merge (orders with the same code are updated)`
      );
      if (replace) {
        orders = incoming;
      } else {
        const byCode = new Map(orders.map((o) => [o.code.toUpperCase(), o]));
        incoming.forEach((o) => byCode.set(String(o.code).toUpperCase(), o));
        orders = [...byCode.values()];
      }
      orders.forEach((o) => (o.id ||= uid()));
      if (data.settings) settings = normalizeSettings({ ...settings, ...data.settings });
      persistOrders();
      persistSettings();
      settingsDialog.close();
      render();
      toast(`Imported ${incoming.length} orders`);
    } catch {
      toast("That file isn't a valid Dawn Sogni backup");
    }
  });

  // ---------- New version notice ----------
  const updateDialog = $("#updateDialog");
  let pendingVersion = null;
  let dismissedVersion = null;

  async function fetchLatest() {
    try {
      const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  function showUpdate(mode, version, notes) {
    const n = orders.length;
    const ordersText = `${n} order${n === 1 ? "" : "s"}`;
    pendingVersion = mode === "available" ? version : null;
    $("#updateEyebrow").textContent = mode === "available" ? "Update available" : "Updated";
    $("#updateTitle").textContent = mode === "available" ? `Version ${version} is ready` : `Now on version ${version}`;
    $("#updateText").textContent =
      mode === "available"
        ? `Download a backup of your ${ordersText} first, then update. Your orders stay saved in this browser either way.`
        : `The tracker was just updated. Download a fresh backup of your ${ordersText} to keep a safe copy.`;
    $("#updateNotes").innerHTML = (notes || []).map((t) => `<li>${esc(t)}</li>`).join("");
    const backupBtn = $("#updateBackupBtn");
    backupBtn.textContent = `Download backup (${ordersText})`;
    backupBtn.classList.remove("done");
    $("#updateNowBtn").hidden = mode !== "available";
    $("#updateLaterBtn").textContent = mode === "available" ? "Later" : "Continue";
    if (!updateDialog.open) updateDialog.showModal();
  }

  $("#updateBackupBtn").addEventListener("click", (e) => {
    exportBackup();
    e.currentTarget.textContent = "✓ Backup downloaded";
    e.currentTarget.classList.add("done");
  });
  $("#updateLaterBtn").addEventListener("click", () => {
    if (pendingVersion) dismissedVersion = pendingVersion;
    updateDialog.close();
  });
  $("#updateNowBtn").addEventListener("click", () => {
    // Already backed up here, so skip the "updated" notice after the reload.
    try {
      localStorage.setItem(SEEN_VERSION_KEY, pendingVersion);
    } catch {}
    location.replace(`${location.pathname}?v=${encodeURIComponent(pendingVersion)}`);
  });
  // Escape would close it without recording "Later"; treat it the same.
  updateDialog.addEventListener("cancel", () => {
    if (pendingVersion) dismissedVersion = pendingVersion;
  });

  // A newer version was published while this page is open (or cached).
  async function checkForUpdate() {
    if (document.querySelector("dialog[open]")) return; // never interrupt an edit
    const latest = await fetchLatest();
    if (!latest || cmpVersion(latest.version, APP_VERSION) <= 0 || latest.version === dismissedVersion) return;
    if (!orders.length) {
      // Nothing to back up: reload straight away, but only once per version in case the old page is still cached.
      try {
        if (sessionStorage.getItem("ds-tracker:reloadedFor") === latest.version) return;
        sessionStorage.setItem("ds-tracker:reloadedFor", latest.version);
      } catch {
        return;
      }
      return location.replace(`${location.pathname}?v=${encodeURIComponent(latest.version)}`);
    }
    showUpdate("available", latest.version, latest.notes);
  }

  // This page load is the first since an update.
  async function checkJustUpdated() {
    let seen = null;
    try {
      seen = localStorage.getItem(SEEN_VERSION_KEY);
      if (!seen || cmpVersion(APP_VERSION, seen) > 0) localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION);
    } catch {
      return;
    }
    // Before 1.1.0 nothing recorded the version, so existing orders with no record mean an update.
    const updated = seen ? cmpVersion(APP_VERSION, seen) > 0 : orders.length > 0;
    if (!updated || !orders.length) return;
    const latest = await fetchLatest();
    showUpdate("updated", APP_VERSION, latest && latest.version === APP_VERSION ? latest.notes : []);
  }

  if (location.search) history.replaceState(null, "", location.pathname);
  render();
  checkJustUpdated().then(checkForUpdate);
  setInterval(checkForUpdate, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
})();
