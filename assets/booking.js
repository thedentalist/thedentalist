// Online appointment request backed by the clinic's Google Calendar (see backend/).
// Free slots come from the calendar, a request holds the slot as PENDING,
// and the clinic confirms or declines it. Nothing is confirmed automatically.
(function () {
  const root = document.getElementById("booking");
  if (!root) return;

  // Apps Script Web App URL (…/exec). Opening hours and slot length live in backend/Code.gs.
  const ENDPOINT = root.dataset.endpoint || "";
  const CLINIC_PHONE = "+36 30 252 5092";
  const CLINIC_EMAIL = "info@thedentalist.hu";

  const lang = root.dataset.lang || (/\/en(?:\/|$)/.test(window.location.pathname) ? "en" : "hu");
  const T = {
    hu: {
      title: "Online időpontkérés",
      intro: "Válasszon egy szabad 1 órás időpontot, majd adja meg elérhetőségét. Az időpontot azonnal fenntartjuk Önnek, de akkor válik érvényessé, ha rendelőnk telefonon vagy e-mailben visszaigazolja. Munkatársunk legfeljebb 24 órán belül válaszol.",
      loading: "Szabad időpontok betöltése…",
      loadError: `Az online foglalás most nem érhető el. Kérjük, hívjon minket: <a href="tel:+36302525092">${CLINIC_PHONE}</a>, vagy írjon: <a href="mailto:${CLINIC_EMAIL}">${CLINIC_EMAIL}</a>.`,
      noDays: "A következő hetekben nincs szabad online időpont. Kérjük, hívjon minket.",
      errTaken: "Ezt az időpontot közben valaki más lefoglalta. Kérjük, válasszon másikat.",
      errTooMany: "Ma már több kérést küldött erről a telefonszámról. Kérjük, hívjon minket.",
      step2: "1. Válasszon napot",
      step3: "2. Válasszon időpontot (1 óra)",
      pickDay: "Először válasszon napot.",
      noSlots: "Ezen a napon már nincs szabad időpont.",
      step4: "3. Adatok",
      name: "Teljes név",
      phone: "Telefonszám",
      email: "E-mail-cím",
      consent: "Tudomásul veszem, hogy megadott adataimat a rendelő az időpont egyeztetése céljából kezeli. Az Adatkezelési tájékoztatót megismertem.",
      privacy: "Adatkezelési tájékoztató",
      privacyHref: "adatkezelesi-tajekoztato.html",
      submit: "Időpontkérés elküldése",
      summary: "Kért időpont",
      pending: "Függőben – a rendelő visszaigazolására vár",
      errRequired: "Kérjük, töltse ki ezt a mezőt.",
      errPhone: "Kérjük, adjon meg érvényes telefonszámot.",
      errEmail: "Kérjük, adjon meg érvényes e-mail-címet.",
      errConsent: "A küldéshez meg kell erősítenie, hogy megismerte az adatkezelési tájékoztatót.",
      errSlot: "Kérjük, válasszon napot és időpontot.",
      okTitle: "Köszönjük, az időpontkérést megkaptuk!",
      okText: "Az időpontot fenntartjuk Önnek, de még NINCS megerősítve. Munkatársunk legfeljebb 24 órán belül felveszi Önnel a kapcsolatot, hogy visszaigazolja vagy módosítsa. Ha megadta e-mail-címét, a visszaigazolást e-mailben is elküldjük.",
      sendError: "A küldés nem sikerült. Kérjük, próbálja újra, vagy hívjon minket: +36 30 252 5092.",
      sending: "Küldés…",
      days: ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"],
      daysShort: ["V", "H", "K", "Sze", "Cs", "P", "Szo"],
      months: ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."],
      fmtDate: (d, t) => `${d.getFullYear()}. ${t.months[d.getMonth()]} ${d.getDate()}., ${t.days[d.getDay()]}`
    },
    en: {
      title: "Online appointment request",
      intro: "Choose a free 1-hour slot and enter your contact details. We hold the slot for you straight away, but the appointment becomes valid only once our clinic confirms it by phone or e-mail. Our team will reply within 24 hours at the latest.",
      loading: "Loading free slots…",
      loadError: `Online booking is not available right now. Please call us on <a href="tel:+36302525092">${CLINIC_PHONE}</a> or email <a href="mailto:${CLINIC_EMAIL}">${CLINIC_EMAIL}</a>.`,
      noDays: "There are no free online slots in the coming weeks. Please call us.",
      errTaken: "Someone else has just booked this time. Please choose another one.",
      errTooMany: "You have already sent several requests from this phone number today. Please call us.",
      step2: "1. Choose a day",
      step3: "2. Choose a time (1 hour)",
      pickDay: "Please choose a day first.",
      noSlots: "No free slots left on this day.",
      step4: "3. Your details",
      name: "Full name",
      phone: "Phone number",
      email: "Email address",
      consent: "I acknowledge that the clinic processes my data to arrange this appointment. I have read the Privacy Notice.",
      privacy: "Privacy Notice",
      privacyHref: "privacy-notice.html",
      submit: "Send appointment request",
      summary: "Requested appointment",
      pending: "Pending – awaiting confirmation by the clinic",
      errRequired: "Please fill in this field.",
      errPhone: "Please enter a valid phone number.",
      errEmail: "Please enter a valid email address.",
      errConsent: "Please confirm that you have read the Privacy Notice to submit.",
      errSlot: "Please choose a day and a time.",
      okTitle: "Thank you, we received your request!",
      okText: "We are holding this time for you, but it is NOT confirmed yet. Our team will contact you within 24 hours at the latest to confirm or adjust it. If you gave an email address, we will also send the confirmation by email.",
      sendError: "Sending failed. Please try again or call us: +36 30 252 5092.",
      sending: "Sending…",
      days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      fmtDate: (d, t) => `${t.days[d.getDay()]}, ${t.months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
    }
  }[lang];


  const pad = n => String(n).padStart(2, "0");
  const toMin = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const fmtTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  // Server dates are Budapest calendar days ("YYYY-MM-DD"); build a local date only for display.
  const dayDate = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const state = { days: [], slotMinutes: 60, date: null, start: null };
  const slotEnd = start => fmtTime(toMin(start) + state.slotMinutes);

  root.innerHTML = `
    <h2 class="section-title gold-text">${T.title}</h2>
    <p>${T.intro}</p>
    <form id="booking-form" novalidate>
      <div class="booking-block">
        <h3 class="booking-legend">${T.step2}</h3>
        <div class="booking-days" id="booking-days" role="group" aria-live="polite"><p class="booking-note">${T.loading}</p></div>
      </div>
      <div class="booking-block">
        <h3 class="booking-legend">${T.step3}</h3>
        <div class="booking-slots" id="booking-slots" role="group" aria-live="polite"></div>
        <div class="booking-error" id="err-slot"></div>
      </div>
      <fieldset class="booking-block">
        <legend>${T.step4}</legend>
        <div class="row g-3">
          <div class="col-md-6">
            <label for="b-name" class="form-label">${T.name}</label>
            <input class="form-control" id="b-name" name="name" autocomplete="name" maxlength="120" required>
            <div class="booking-error" id="err-name"></div>
          </div>
          <div class="col-md-6">
            <label for="b-phone" class="form-label">${T.phone}</label>
            <input class="form-control" id="b-phone" name="phone" type="tel" autocomplete="tel" maxlength="30" required>
            <div class="booking-error" id="err-phone"></div>
          </div>
          <div class="col-md-6">
            <label for="b-email" class="form-label">${T.email}</label>
            <input class="form-control" id="b-email" name="email" type="email" autocomplete="email" maxlength="254">
            <div class="booking-error" id="err-email"></div>
          </div>
          <div class="booking-hp" aria-hidden="true">
            <label for="b-website">Website</label>
            <input id="b-website" name="website" tabindex="-1" autocomplete="off">
          </div>
        </div>
        <div class="form-check mt-3">
          <input class="form-check-input" type="checkbox" id="b-consent" required>
          <label class="form-check-label" for="b-consent">${T.consent} (<a href="${T.privacyHref}">${T.privacy}</a>)</label>
          <div class="booking-error" id="err-consent"></div>
        </div>
      </fieldset>
      <div class="booking-summary" id="booking-summary" hidden></div>
      <button type="submit" class="btn btn-gold mt-3" id="booking-submit" disabled>${T.submit}</button>
      <div class="booking-result" id="booking-result" role="status" aria-live="polite" hidden></div>
    </form>`;

  const form = root.querySelector("#booking-form");
  const daysEl = root.querySelector("#booking-days");
  const slotsEl = root.querySelector("#booking-slots");
  const summaryEl = root.querySelector("#booking-summary");
  const resultEl = root.querySelector("#booking-result");
  const submit = root.querySelector("#booking-submit");
  const setErr = (id, msg) => { root.querySelector("#err-" + id).textContent = msg || ""; };
  const findDay = iso => state.days.find(d => d.date === iso);

  function renderDays() {
    if (!state.days.some(d => d.slots.length)) {
      daysEl.innerHTML = `<p class="booking-note">${T.noDays}</p>`;
      return;
    }
    let lastMonth = -1;
    // Only days with free time are listed; booked times and full days are never shown.
    daysEl.innerHTML = state.days.filter(d => d.slots.length).map(d => {
      const dt = dayDate(d.date);
      const showMonth = dt.getMonth() !== lastMonth;
      lastMonth = dt.getMonth();
      return `
      <button type="button" class="booking-day" data-date="${d.date}" aria-pressed="${d.date === state.date}">
        <span class="booking-day-name">${T.daysShort[dt.getDay()]}</span>
        <span class="booking-day-num">${dt.getDate()}</span>
        <span class="booking-day-month">${showMonth ? T.months[dt.getMonth()] : "&nbsp;"}</span>
      </button>`;
    }).join("");
  }

  function renderSlots() {
    const day = state.date && findDay(state.date);
    if (!day) {
      slotsEl.innerHTML = `<p class="booking-note">${T.pickDay}</p>`;
      return;
    }
    slotsEl.innerHTML = day.slots.length
      ? day.slots.map(s => `<button type="button" class="booking-slot" data-start="${s}" aria-pressed="${s === state.start}">${s} – ${slotEnd(s)}</button>`).join("")
      : `<p class="booking-note">${T.noSlots}</p>`;
  }

  function renderSummary() {
    if (!state.date || !state.start) { summaryEl.hidden = true; return; }
    summaryEl.hidden = false;
    summaryEl.innerHTML = `<strong>${T.summary}:</strong> ${esc(T.fmtDate(dayDate(state.date), T))}, ${state.start} – ${slotEnd(state.start)}<br><span class="booking-pending">${T.pending}</span>`;
  }

  function renderAll() { renderDays(); renderSlots(); renderSummary(); }

  async function loadSlots() {
    const res = await fetch(`${ENDPOINT}${ENDPOINT.includes("?") ? "&" : "?"}action=slots`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.ok || !Array.isArray(data.days)) throw new Error("slots");
    state.days = data.days;
    state.slotMinutes = data.slotMinutes || 60;
    // Drop a selection that is no longer free.
    const day = state.date && findDay(state.date);
    if (!day || !day.slots.length) { state.date = null; state.start = null; }
    else if (state.start && !day.slots.includes(state.start)) state.start = null;
    renderAll();
  }

  daysEl.addEventListener("click", e => {
    const btn = e.target.closest(".booking-day");
    if (!btn) return;
    state.date = btn.dataset.date;
    state.start = null;
    daysEl.querySelectorAll(".booking-day").forEach(b => b.setAttribute("aria-pressed", b === btn));
    setErr("slot");
    renderSlots();
    renderSummary();
  });

  slotsEl.addEventListener("click", e => {
    const btn = e.target.closest(".booking-slot");
    if (!btn) return;
    state.start = btn.dataset.start;
    slotsEl.querySelectorAll(".booking-slot").forEach(b => b.setAttribute("aria-pressed", b === btn));
    setErr("slot");
    renderSummary();
  });

  function validate() {
    let ok = true;
    ["name", "phone", "email", "consent", "slot"].forEach(k => setErr(k));
    if (!state.date || !state.start) { setErr("slot", T.errSlot); ok = false; }
    if (!form.elements.name.value.trim()) { setErr("name", T.errRequired); ok = false; }
    const phone = form.elements.phone.value.trim();
    if (!phone) { setErr("phone", T.errRequired); ok = false; }
    else if (!/^[+\d][\d\s()\/-]{6,}$/.test(phone) || phone.replace(/\D/g, "").length < 7) { setErr("phone", T.errPhone); ok = false; }
    if (form.elements.email.value.trim() && !form.elements.email.validity.valid) { setErr("email", T.errEmail); ok = false; }
    if (!root.querySelector("#b-consent").checked) { setErr("consent", T.errConsent); ok = false; }
    return ok;
  }

  function showResult(title, text, isError) {
    resultEl.hidden = false;
    resultEl.className = "booking-result " + (isError ? "is-error" : "is-ok");
    resultEl.innerHTML = (title ? `<strong>${title}</strong><br>` : "") + text;
    resultEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    resultEl.hidden = true;
    if (!validate()) {
      const first = root.querySelector(".booking-error:not(:empty)");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const payload = {
      action: "book",
      date: state.date,
      start: state.start,
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      website: form.elements.website.value,
      consent: true,
      language: lang
    };
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = T.sending;
    try {
      // text/plain keeps this a "simple" request, which Apps Script can answer cross-origin.
      const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        form.reset();
        state.date = null; state.start = null;
        showResult(T.okTitle, T.okText, false);
        loadSlots().catch(renderAll);
        return;
      }
      if (data.error === "taken") {
        setErr("slot", T.errTaken);
        await loadSlots().catch(() => {});
        root.querySelector("#err-slot").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      showResult("", data.error === "too_many" ? T.errTooMany : T.sendError, true);
    } catch (err) {
      showResult("", T.sendError, true);
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });

  renderSlots();
  if (!ENDPOINT) {
    daysEl.innerHTML = `<p class="booking-note">${T.loadError}</p>`;
    return;
  }
  loadSlots().then(() => { submit.disabled = false; })
    .catch(() => { daysEl.innerHTML = `<p class="booking-note">${T.loadError}</p>`; slotsEl.innerHTML = ""; });
})();
