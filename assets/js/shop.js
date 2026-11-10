/* SilaRex webshop V2: land en valuta, winkelmand, productkeuze, afrekenen, cookies. Geen afhankelijkheden. */
(() => {
  const SX = window.SX;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sx_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("sx_" + k, JSON.stringify(v)); } catch { /* opslag geblokkeerd: de site blijft werken zonder onthouden */ } },
  };
  try { localStorage.setItem("sx_lang", SX.lang); } catch { /* idem */ }
  const fill = (s, vars = {}) => Object.entries(vars).reduce((a, [k, v]) => a.split(`{${k}}`).join(v), s);
  const T = SX.t;
  const plans = Object.fromEntries(SX.plans.map(p => [p.id, p]));

  // ---------- land en valuta ----------
  let countryCode = store.get("country", null);
  if (!countryCode || !SX.countries[countryCode]) countryCode = SX.defaultCountry;
  const C = () => { const c = SX.countries[countryCode]; return { ...c, code: countryCode, z: SX.zones[c.zone] }; };
  const money = (v, cur = C().cur) => new Intl.NumberFormat(SX.locale, { style: "currency", currency: cur, minimumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v);
  const priceOf = id => SX.pricing[C().cur][id];
  const perDay = id => priceOf(id) / (plans[id].bottles * SX.servings);
  const saving = id => SX.pricing[C().cur][1] * plans[id].bottles - priceOf(id);
  const feeOf = z => z.fee[C().cur] ?? z.fee.EUR;
  const freeOf = z => z.free[C().cur] ?? null;

  function deliveryText() {
    const c = C();
    const add = n => { const d = new Date(); let left = n; while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) left--; } return d; };
    const f = new Intl.DateTimeFormat(SX.locale, { weekday: "short", day: "numeric", month: "short" });
    return fill(T.buy.delivery, { country: c.name, a: f.format(add(c.z.days[0])), b: f.format(add(c.z.days[1])) });
  }
  function shipLine() {
    const c = C(), free = freeOf(c.z);
    return free != null ? fill(T.buy.freeFrom, { amt: money(free) }) : fill(T.buy.shipCost, { country: c.name, amt: money(feeOf(c.z)) });
  }
  function renderLocale() {
    const c = C(), free = freeOf(c.z);
    $$("[data-price]").forEach(el => { el.textContent = money(priceOf(el.dataset.price)); });
    $$("[data-perday]").forEach(el => { el.textContent = money(perDay(el.dataset.perday)); });
    $$("[data-perday-text]").forEach(el => { el.textContent = fill(T.plan.perDay, { amt: money(perDay(el.dataset.perdayText)) }); });
    $$("[data-save]").forEach(el => { el.textContent = fill(T.plan.save, { amt: money(saving(el.dataset.save)) }); });
    $$("[data-country-label]").forEach(el => { el.textContent = `${c.name}, ${c.cur}`; });
    $$("[data-util]").forEach(el => { el.textContent = free != null ? fill(T.util.free, { country: c.name, amt: money(free) }) : fill(T.util.ship, { country: c.name }); });
    $$("[data-delivery]").forEach(el => { el.textContent = deliveryText(); });
    $$("[data-shipline]").forEach(el => { el.textContent = shipLine(); });
    $$("[data-duties]").forEach(el => { el.hidden = !c.z.duties; });
    $$("[data-country-select],[data-co-country]").forEach(el => { el.value = countryCode; });
    renderSelected();
    renderCart();
    renderCheckout();
  }
  function setCountry(code) { countryCode = code; store.set("country", code); renderLocale(); }

  // ---------- winkelmand ----------
  let cart = store.get("cart", []).filter(i => SX.products[i.p] && plans[i.plan] && i.qty > 0);
  const saveCart = () => { store.set("cart", cart); renderCart(); renderCheckout(); };
  const subtotal = () => cart.reduce((a, i) => a + priceOf(i.plan) * i.qty, 0);
  const shipping = () => { const z = C().z, free = freeOf(z), s = subtotal(); return !cart.length ? 0 : free != null && s >= free ? 0 : feeOf(z); };
  const planLabel = id => plans[id].sub ? `${T.plan.sub}, ${T.cart.every}` : T.plan[id];
  function add(p, plan = "1", open = true) {
    const hit = cart.find(i => i.p === p && i.plan === plan);
    if (hit) hit.qty++; else cart.push({ p, plan, qty: 1 });
    saveCart();
    track("add_to_cart", { item_id: p, plan, value: priceOf(plan), currency: C().cur });
    if (open) $("#cart-dialog")?.showModal();
  }
  const lineHTML = (i, idx, editable) => `<div class="line">
    <img src="${SX.products[i.p].img}" alt="" width="72" height="72" loading="lazy">
    <div class="line-t"><b>${SX.products[i.p].name}</b><small>${planLabel(i.plan)}</small>${editable ? `<div class="qty"><button type="button" data-qty="${idx}" data-d="-1" aria-label="${T.cart.down}">&minus;</button><span>${i.qty}</span><button type="button" data-qty="${idx}" data-d="1" aria-label="${T.cart.up}">+</button></div>` : `<small> x ${i.qty}</small>`}</div>
    <div class="line-r"><span>${money(priceOf(i.plan) * i.qty)}</span>${editable ? `<button type="button" class="line-rm" data-rm="${idx}">${T.cart.remove}</button>` : ""}</div>
  </div>`;
  const totalsHTML = () => {
    const c = C();
    return `<div class="tot-row"><span>${T.cart.subtotal}</span><span>${money(subtotal())}</span></div>
      <div class="tot-row"><span>${fill(T.cart.shipping, { country: c.name })}</span><span>${shipping() ? money(shipping()) : T.cart.free}</span></div>
      <div class="tot-row total"><span>${T.cart.total}</span><span>${money(subtotal() + shipping())}</span></div>
      <p class="tot-note">${c.z.duties ? T.cart.duties : T.cart.vat}</p>`;
  };
  function renderCart() {
    const n = cart.reduce((a, i) => a + i.qty, 0);
    $$("[data-cart-count]").forEach(el => { el.textContent = n; el.hidden = !n; });
    $$("[data-cart-root]").forEach(root => {
      if (!cart.length) { root.innerHTML = `<div class="cart-empty"><p>${T.cart.empty}</p><a class="btn" href="${SX.urls.home}#kies" data-close>${T.cart.emptyCta}</a></div>`; return; }
      const c = C(), free = freeOf(c.z), s = subtotal();
      const progress = free == null ? "" : `<div class="progress"><span>${s >= free ? fill(T.cart.progressDone, { country: c.name }) : fill(T.cart.progress, { amt: money(free - s), country: c.name })}</span><div class="progress-bar"><i style="width:${Math.min(100, s / free * 100)}%"></i></div></div>`;
      const others = Object.keys(SX.products).filter(p => !cart.some(i => i.p === p));
      const cross = others.length ? `<div class="cross"><p class="cross-h">${T.cart.cross}</p>${others.map(p => `<div class="cross-item"><img src="${SX.products[p].img}" alt="" width="52" height="52" loading="lazy"><span><b>${SX.products[p].name}</b><small>${money(priceOf(1))}</small></span><button type="button" class="cross-add" data-cross="${p}">${T.cart.add}</button></div>`).join("")}</div>` : "";
      root.innerHTML = `<div class="cart-scroll">${progress}${cart.map((i, x) => lineHTML(i, x, true)).join("")}${cross}</div>
        <div class="cart-foot">${totalsHTML()}<a class="btn btn-block btn-lg" href="${SX.urls.checkout}">${T.cart.checkout}</a></div>`;
    });
  }
  document.addEventListener("click", e => {
    const q = e.target.closest("[data-qty]");
    if (q) { const i = cart[+q.dataset.qty]; i.qty += +q.dataset.d; if (i.qty < 1) cart.splice(+q.dataset.qty, 1); saveCart(); return; }
    const rm = e.target.closest("[data-rm]");
    if (rm) { cart.splice(+rm.dataset.rm, 1); saveCart(); return; }
    const cr = e.target.closest("[data-cross]");
    if (cr) { add(cr.dataset.cross, "1", false); return; }
    const qa = e.target.closest("[data-quick-add]");
    if (qa) { add(qa.dataset.quickAdd); return; }
    const op = e.target.closest("[data-open]");
    if (op) { $$("dialog[open]").forEach(d => d.close()); $("#" + op.dataset.open)?.showModal(); return; }
    const cl = e.target.closest("[data-close]");
    if (cl) { cl.closest("dialog")?.close(); return; }
    if (e.target.matches("dialog.drawer,dialog.modal")) e.target.close();
  });

  // ---------- productkeuze ----------
  const buy = $("[data-buy]");
  function selectedPlan() { return buy ? buy.querySelector("input[name=plan]:checked")?.value || "1" : "1"; }
  function renderSelected() {
    if (!buy) return;
    const id = selectedPlan();
    $$("[data-selected-price]").forEach(el => { el.textContent = money(priceOf(id)); });
    $$("[data-selected-label]").forEach(el => { el.textContent = planLabel(id); });
  }
  if (buy) {
    buy.addEventListener("change", renderSelected);
    buy.addEventListener("submit", e => { e.preventDefault(); add(buy.dataset.buy, selectedPlan()); });
    $("[data-sticky-add]")?.addEventListener("click", () => add(buy.dataset.buy, selectedPlan()));
    track("view_item", { item_id: buy.dataset.buy, currency: C().cur, value: priceOf("1") });
    const sticky = $("[data-sticky]"), btn = $("#add");
    if (sticky && btn && "IntersectionObserver" in window) {
      // op mobiel altijd bereikbaar, op desktop pas als de hoofdknop uit beeld is gescrold
      new IntersectionObserver(([en]) => { sticky.hidden = en.isIntersecting || (innerWidth > 900 && en.boundingClientRect.top > 0); }).observe(btn);
    }
    // galerij en vergroten
    const thumbs = $$("[data-thumb]"), main = $("[data-main]");
    let cur = 0;
    const show = i => {
      cur = (i + thumbs.length) % thumbs.length;
      thumbs.forEach((t, x) => { if (x === cur) t.setAttribute("aria-current", "true"); else t.removeAttribute("aria-current"); });
      main.removeAttribute("srcset"); main.src = thumbs[cur].dataset.src; main.alt = thumbs[cur].dataset.alt;
      const lb = $("[data-lb-img]");
      if (lb && $("#lightbox").open) { lb.src = thumbs[cur].dataset.src; lb.alt = thumbs[cur].dataset.alt; $("[data-lb-cap]").textContent = thumbs[cur].dataset.alt; }
    };
    thumbs.forEach((t, i) => t.addEventListener("click", () => show(i)));
    $("[data-zoom]")?.addEventListener("click", () => {
      const d = $("#lightbox"); const lb = $("[data-lb-img]");
      lb.src = thumbs[cur].dataset.src; lb.alt = thumbs[cur].dataset.alt; $("[data-lb-cap]").textContent = thumbs[cur].dataset.alt; d.showModal();
    });
    $$("[data-lb]").forEach(b => b.addEventListener("click", () => show(cur + +b.dataset.lb)));
    $("#lightbox")?.addEventListener("keydown", e => { if (e.key === "ArrowRight") show(cur + 1); if (e.key === "ArrowLeft") show(cur - 1); });
  }

  // ---------- reviews ----------
  $$("[data-rv-list][data-limit]").forEach(list => {
    const limit = +list.dataset.limit, items = $$(".rv", list), more = list.parentElement.querySelector("[data-rv-more]");
    if (items.length <= limit) return;
    items.slice(limit).forEach(r => { r.hidden = true; });
    if (more) { more.hidden = false; more.addEventListener("click", () => { items.forEach(r => { r.hidden = false; }); more.hidden = true; }); }
  });
  // reviewpagina: filteren op product, onderwerp en sterren
  const wall = $("[data-wall]");
  if (wall) {
    const cards = $$(".rv", wall), limit = +wall.dataset.limit, feats = $$("[data-feature]");
    const more = $(".rp-wall [data-rv-more]"), count = $("[data-rv-count]"), empty = $("[data-rv-empty]"), clear = $("[data-rv-clear]");
    const st = { p: "", g: "", s: "" };
    let expanded = false;
    const apply = () => {
      const key = st.g || st.s ? null : st.p || "all";
      let featI = null;
      feats.forEach(f => { const on = f.dataset.feature === key; f.hidden = !on; if (on) featI = f.dataset.i; });
      const match = cards.filter(c => (!st.p || c.dataset.p === st.p) && (!st.g || c.dataset.g === st.g) && (!st.s || c.dataset.s === st.s) && c.dataset.i !== featI);
      cards.forEach(c => { c.hidden = true; });
      match.forEach((c, i) => { c.hidden = !expanded && i >= limit; });
      count.textContent = fill(T.reviews.results, { n: match.length + (featI != null ? 1 : 0) });
      more.hidden = expanded || match.length <= limit;
      empty.hidden = match.length > 0 || featI != null;
      clear.hidden = !(st.p || st.g || st.s);
      $$("[data-f-p]").forEach(b => b.setAttribute("aria-pressed", b.dataset.fP === st.p));
      $$("[data-f-g]").forEach(b => b.setAttribute("aria-pressed", b.dataset.fG === st.g));
      $$("[data-f-s]").forEach(b => b.setAttribute("aria-pressed", b.dataset.fS === st.s));
    };
    const bind = (attr, key, ds) => $$(`[${attr}]`).forEach(b => b.addEventListener("click", () => { st[key] = st[key] === b.dataset[ds] ? "" : b.dataset[ds]; expanded = false; apply(); }));
    bind("data-f-p", "p", "fP"); bind("data-f-g", "g", "fG"); bind("data-f-s", "s", "fS");
    clear.addEventListener("click", () => { st.p = st.g = st.s = ""; expanded = false; apply(); });
    more.addEventListener("click", () => { expanded = true; apply(); });
    apply();
  }

  // ---------- bewegende reviews op de home: van links naar rechts, stopt bij muis, focus of aanraken ----------
  const rail = $("[data-rail]");
  if (rail && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const track = rail.firstElementChild;
    [...track.children].forEach(c => { const k = c.cloneNode(true); k.setAttribute("aria-hidden", "true"); k.inert = true; track.append(k); });
    const SPEED = 38; // pixels per seconde
    let half = 0, pos = 0, last = null, hover = false, focus = false, touch = false, stopped = false, visible = false;
    const measure = () => { const old = half; half = track.scrollWidth / 2; pos = old ? pos * (half / old) : half; rail.scrollLeft = pos; };
    measure();
    addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    rail.addEventListener("mouseenter", () => { hover = true; });
    rail.addEventListener("mouseleave", () => { hover = false; });
    rail.addEventListener("focusin", e => { focus = e.target.matches(":focus-visible"); });
    rail.addEventListener("focusout", () => { focus = false; });
    rail.addEventListener("touchstart", () => { touch = true; }, { passive: true });
    rail.addEventListener("touchend", () => { setTimeout(() => { touch = false; }, 1800); }, { passive: true });
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(rail);
    const toggle = $("[data-rail-toggle]");
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener("click", () => {
        stopped = !stopped;
        $(".rt-pause", toggle).hidden = stopped; $(".rt-play", toggle).hidden = !stopped;
        $("[data-rail-label]", toggle).textContent = stopped ? toggle.dataset.play : toggle.dataset.pause;
      });
    }
    const tick = t => {
      const dt = last == null ? 0 : Math.min(64, t - last);
      last = t;
      if (visible && !hover && !focus && !touch && !stopped && !document.hidden) {
        pos -= SPEED * dt / 1000;
        if (pos <= 0) pos += half;
        rail.scrollLeft = pos;
      } else {
        // handmatig scrollen blijft rondlopen, en de beweging gaat daarna verder vanaf die plek
        if (rail.scrollLeft >= half * 1.5) rail.scrollLeft -= half;
        else if (rail.scrollLeft <= half * .02) rail.scrollLeft += half;
        pos = rail.scrollLeft;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- productkiezer op de home ----------
  const tabs = $$("[role=tab]");
  const selectTab = (tab, focus) => {
    tabs.forEach(t => { const on = t === tab; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; const panel = $("#" + t.getAttribute("aria-controls")); if (on) panel.removeAttribute("data-tab-hidden"); else panel.setAttribute("data-tab-hidden", ""); });
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t));
    t.addEventListener("keydown", e => { if (e.key === "ArrowRight") selectTab(tabs[(i + 1) % tabs.length], true); if (e.key === "ArrowLeft") selectTab(tabs[(i + tabs.length - 1) % tabs.length], true); });
  });

  // ---------- land kiezen ----------
  $$("[data-country-form]").forEach(f => f.addEventListener("submit", () => setCountry($("[data-country-select]", f).value)));

  // ---------- nieuwsbrief ----------
  const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  $$("[data-news]").forEach(f => f.addEventListener("submit", e => {
    e.preventDefault();
    const inp = f.email, err = $("[data-err]", f), ok = $("[data-ok]", f);
    const good = validEmail(inp.value);
    err.hidden = good; err.textContent = good ? "" : err.dataset.err; ok.hidden = !good;
    inp.setAttribute("aria-invalid", !good);
    if (good) { inp.value = ""; track("newsletter_signup", {}); }
  }));

  // ---------- afrekenen ----------
  const checkout = $("[data-checkout]");
  function setFieldError(input, msg) {
    const err = input.closest(".field")?.querySelector(".field-err");
    if (err) { err.textContent = msg || ""; err.hidden = !msg; }
    input.setAttribute("aria-invalid", !!msg);
  }
  function validate(form) {
    let first = null;
    $$("input[required]", form).forEach(i => {
      const empty = !i.value.trim(), badMail = i.type === "email" && !empty && !validEmail(i.value);
      setFieldError(i, empty ? SX.err.req : badMail ? SX.err.email : "");
      if ((empty || badMail) && !first) first = i;
    });
    first?.focus();
    return !first;
  }
  function renderCheckout() {
    if (!checkout) return;
    const empty = !cart.length;
    $("[data-co-empty]").hidden = !empty;
    $("[data-co-grid]").hidden = empty;
    if (empty) return;
    const box = $("[data-pay-options]"), keep = box.querySelector("input:checked")?.value;
    const methods = C().z.pay;
    box.innerHTML = methods.map((m, i) => `<label class="pay-opt"><input type="radio" name="pay" value="${m}"${(keep ? keep === m : i === 0) ? " checked" : ""}><span>${T.payMethods[m]}</span></label>`).join("");
    if (!box.querySelector("input:checked")) box.querySelector("input").checked = true;
    $("[data-co-lines]").innerHTML = cart.map((i, x) => lineHTML(i, x, false)).join("") + `<div class="cart-foot" style="padding:12px 0 0">${totalsHTML()}</div>`;
    $("[data-co-total]").textContent = money(subtotal() + shipping());
  }
  if (checkout) {
    if (cart.length) track("begin_checkout", { currency: C().cur, value: subtotal() });
    $("[data-co-country]").addEventListener("change", e => setCountry(e.target.value));
    $$("input[required]", checkout).forEach(i => i.addEventListener("input", () => { if (i.getAttribute("aria-invalid") === "true") { const v = i.value.trim(); if (v && (i.type !== "email" || validEmail(v))) setFieldError(i, ""); } }));
    checkout.addEventListener("submit", e => {
      e.preventDefault();
      if (!validate(checkout)) return;
      // Hier komt de koppeling met de betaalprovider (zie README). In demomodus wordt niets afgeschreven of verstuurd.
      const id = "SX-" + Date.now().toString().slice(-7);
      track("purchase", { transaction_id: id, currency: C().cur, value: subtotal() + shipping() });
      store.set("lastOrder", id);
      cart = []; store.set("cart", cart);
      location.href = SX.urls.thanks;
    });
  }
  const orderEl = $("[data-th-order]");
  if (orderEl) orderEl.textContent = store.get("lastOrder", "SX-0000000");
  $("[data-survey]")?.addEventListener("submit", e => {
    e.preventDefault();
    const v = e.target.querySelector("input:checked");
    if (!v) return;
    track("post_purchase_survey", { answer: v.value });
    e.target.hidden = true; $("[data-survey-ok]").hidden = false;
  });

  // ---------- herroepen, in twee stappen ----------
  const wd = $("[data-withdraw]");
  if (wd) {
    const conf = $("[data-withdraw-confirm]"), done = $("[data-withdraw-done]");
    wd.addEventListener("submit", e => {
      e.preventDefault();
      if (!validate(wd)) return;
      $("[data-withdraw-text]").textContent = fill(SX.wdConfirm, { order: wd.order.value.trim(), email: wd.email.value.trim() });
      wd.hidden = true; conf.hidden = false;
    });
    $("[data-withdraw-back]").addEventListener("click", () => { conf.hidden = true; wd.hidden = false; });
    $("[data-withdraw-yes]").addEventListener("click", () => { conf.hidden = true; done.hidden = false; track("withdrawal", {}); });
  }

  // ---------- cookies en metingen: niets wordt gemeten zonder toestemming ----------
  function track(name, params) {
    if (store.get("consent", null) !== "yes") return;
    (window.dataLayer = window.dataLayer || []).push({ event: name, ...params });
  }
  const banner = $("[data-cookie]");
  if (banner) {
    if (store.get("consent", null) == null) banner.hidden = false;
    $$("[data-consent]", banner).forEach(b => b.addEventListener("click", () => { store.set("consent", b.dataset.consent); banner.hidden = true; }));
    $$("[data-open-cookies]").forEach(b => b.addEventListener("click", () => { banner.hidden = false; banner.querySelector("button").focus(); }));
  }

  renderLocale();
})();
