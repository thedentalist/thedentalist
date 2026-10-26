// Online appointment request. Requests are NOT confirmed automatically:
// the clinic reviews each one and confirms it with the patient.
(function () {
  const root = document.getElementById("booking");
  if (!root) return;

  const ENDPOINT = root.dataset.endpoint || "";
  const CLINIC_EMAIL = "info@thedentalist.hu";
  const DAYS_AHEAD = 28;
  const SLOT_MINUTES = 60;

  // [openMinutes, closeMinutes] by JS weekday (0 = Sunday)
  const HOURS = {
    0: [600, 1080], 1: [510, 1200], 2: [510, 1200], 3: [510, 1200],
    4: [510, 1200], 5: [510, 1200], 6: [600, 1080]
  };

  const lang = /\/en(?:\/|$)/.test(window.location.pathname) ? "en" : "hu";
  const T = {
    hu: {
      title: "Online időpontkérés",
      intro: "Válassza ki a szolgáltatást, majd egy szabad 1 órás időpontot. A foglalás csak kérés: az időpont akkor válik érvényessé, ha rendelőnk telefonon vagy e-mailben visszaigazolja.",
      step1: "1. Mire szeretne időpontot?",
      panorama: "Panoráma röntgen",
      ct3d: "3D CT röntgen",
      consultation: "Konzultáció",
      treatmentContinuation: "Kezelés folytatása",
      types: {
        panorama: "Panoráma röntgen",
        ct3d: "3D CT röntgen",
        consultation: "Konzultáció",
        treatment_continuation: "Kezelés folytatása"
      },
      step2: "2. Válasszon napot",
      step3: "3. Válasszon időpontot (1 óra)",
      pickDay: "Először válasszon napot.",
      noSlots: "Ezen a napon már nincs szabad időpont.",
      step4: "4. Adatok",
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
      okText: "Az időpont még NINCS megerősítve. Munkatársunk felveszi Önnel a kapcsolatot, és visszaigazolja vagy módosítja az időpontot.",
      mailText: "Az e-mail program megnyílt. Kérjük, küldje el a kész üzenetet, hogy a kérés megérkezzen hozzánk. Az időpont még NINCS megerősítve; visszaigazolás után válik érvényessé.",
      sendError: "A küldés nem sikerült. Kérjük, próbálja újra, vagy hívjon minket: +36 30 252 5092.",
      sending: "Küldés…",
      days: ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"],
      daysShort: ["V", "H", "K", "Sze", "Cs", "P", "Szo"],
      months: ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."],
      fmtDate: (d, t) => `${d.getFullYear()}. ${t.months[d.getMonth()]} ${d.getDate()}., ${t.days[d.getDay()]}`,
      subject: "Online időpontkérés"
    },
    en: {
      title: "Online appointment request",
      intro: "Choose a service and a free 1-hour slot. This is a request only: the appointment becomes valid once our clinic confirms it by phone or e-mail.",
      step1: "1. What would you like to book?",
      panorama: "Panorama X-ray",
      ct3d: "3D CT X-ray",
      consultation: "Consultation",
      treatmentContinuation: "Treatment continuation",
      types: {
        panorama: "Panorama X-ray",
        ct3d: "3D CT X-ray",
        consultation: "Consultation",
        treatment_continuation: "Treatment continuation"
      },
      step2: "2. Choose a day",
      step3: "3. Choose a time (1 hour)",
      pickDay: "Please choose a day first.",
      noSlots: "No free slots left on this day.",
      step4: "4. Your details",
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
      okText: "Your appointment is NOT yet confirmed. Our team will contact you to confirm or adjust the time.",
      mailText: "Your e-mail app has opened. Please send the prepared message so that the request reaches us. Your appointment is NOT confirmed until we confirm it.",
      sendError: "Sending failed. Please try again or call us: +36 30 252 5092.",
      sending: "Sending…",
      days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      fmtDate: (d, t) => `${t.days[d.getDay()]}, ${t.months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
      subject: "Online appointment request"
    }
  }[lang];

  const pad = n => String(n).padStart(2, "0");
  const fmtTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const state = { type: "consultation", date: null, start: null };

  function slotsFor(date) {
    const [open, close] = HOURS[date.getDay()];
    const now = new Date();
    const isToday = isoDate(date) === isoDate(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const out = [];
    for (let m = open; m + SLOT_MINUTES <= close; m += SLOT_MINUTES) {
      if (isToday && m <= nowMin) continue;
      out.push(m);
    }
    return out;
  }

  function availableDays() {
    const days = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i <= DAYS_AHEAD; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      if (slotsFor(d).length) days.push(d);
    }
    return days;
  }

  const days = availableDays();

  root.innerHTML = `
    <h2 class="section-title gold-text">${T.title}</h2>
    <p>${T.intro}</p>
    <form id="booking-form" novalidate>
      <fieldset class="booking-block">
        <legend>${T.step1}</legend>
        <div class="booking-types">
          <label class="booking-type"><input type="radio" name="type" value="panorama"><span>${T.panorama}</span></label>
          <label class="booking-type"><input type="radio" name="type" value="ct3d"><span>${T.ct3d}</span></label>
          <label class="booking-type"><input type="radio" name="type" value="consultation" checked><span>${T.consultation}</span></label>
          <label class="booking-type"><input type="radio" name="type" value="treatment_continuation"><span>${T.treatmentContinuation}</span></label>
        </div>
      </fieldset>
      <div class="booking-block">
        <h3 class="booking-legend">${T.step2}</h3>
        <div class="booking-days" id="booking-days" role="group"></div>
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
        </div>
        <div class="form-check mt-3">
          <input class="form-check-input" type="checkbox" id="b-consent" required>
          <label class="form-check-label" for="b-consent">${T.consent} (<a href="${T.privacyHref}">${T.privacy}</a>)</label>
          <div class="booking-error" id="err-consent"></div>
        </div>
      </fieldset>
      <div class="booking-summary" id="booking-summary" hidden></div>
      <button type="submit" class="btn btn-gold mt-3" id="booking-submit">${T.submit}</button>
      <div class="booking-result" id="booking-result" role="status" aria-live="polite" hidden></div>
    </form>`;

  const form = root.querySelector("#booking-form");
  const daysEl = root.querySelector("#booking-days");
  const slotsEl = root.querySelector("#booking-slots");
  const summaryEl = root.querySelector("#booking-summary");
  const resultEl = root.querySelector("#booking-result");
  const setErr = (id, msg) => { root.querySelector("#err-" + id).textContent = msg || ""; };

  daysEl.innerHTML = days.map((d, i) => `
    <button type="button" class="booking-day" data-date="${isoDate(d)}" aria-pressed="false">
      <span class="booking-day-name">${T.daysShort[d.getDay()]}</span>
      <span class="booking-day-num">${d.getDate()}</span>
      <span class="booking-day-month">${i === 0 || d.getDate() === 1 ? T.months[d.getMonth()] : "&nbsp;"}</span>
    </button>`).join("");

  function renderSlots() {
    if (!state.date) {
      slotsEl.innerHTML = `<p class="booking-note">${T.pickDay}</p>`;
      return;
    }
    const slots = slotsFor(state.date);
    slotsEl.innerHTML = slots.length
      ? slots.map(m => `<button type="button" class="booking-slot" data-start="${m}" aria-pressed="${m === state.start}">${fmtTime(m)} – ${fmtTime(m + SLOT_MINUTES)}</button>`).join("")
      : `<p class="booking-note">${T.noSlots}</p>`;
  }

  function renderSummary() {
    if (!state.date || state.start === null) { summaryEl.hidden = true; return; }
    summaryEl.hidden = false;
    summaryEl.innerHTML = `<strong>${T.summary}:</strong> ${esc(T.fmtDate(state.date, T))}, ${fmtTime(state.start)} – ${fmtTime(state.start + SLOT_MINUTES)} (${esc(T.types[state.type])})<br><span class="booking-pending">${T.pending}</span>`;
  }

  daysEl.addEventListener("click", e => {
    const btn = e.target.closest(".booking-day");
    if (!btn) return;
    state.date = days.find(d => isoDate(d) === btn.dataset.date);
    state.start = null;
    daysEl.querySelectorAll(".booking-day").forEach(b => b.setAttribute("aria-pressed", b === btn));
    setErr("slot");
    renderSlots();
    renderSummary();
  });

  slotsEl.addEventListener("click", e => {
    const btn = e.target.closest(".booking-slot");
    if (!btn) return;
    state.start = Number(btn.dataset.start);
    slotsEl.querySelectorAll(".booking-slot").forEach(b => b.setAttribute("aria-pressed", b === btn));
    setErr("slot");
    renderSummary();
  });

  form.addEventListener("change", e => {
    if (e.target.name === "type") { state.type = e.target.value; renderSummary(); }
  });

  function validate() {
    let ok = true;
    ["name", "phone", "email", "consent", "slot"].forEach(k => setErr(k));
    if (!state.date || state.start === null) { setErr("slot", T.errSlot); ok = false; }
    if (!form.elements.name.value.trim()) { setErr("name", T.errRequired); ok = false; }
    const phone = form.elements.phone.value.trim();
    if (!phone) { setErr("phone", T.errRequired); ok = false; }
    else if (!/^[+\d][\d\s()\/-]{6,}$/.test(phone) || phone.replace(/\D/g, "").length < 7) { setErr("phone", T.errPhone); ok = false; }
    if (form.elements.email.value.trim() && !form.elements.email.validity.valid) { setErr("email", T.errEmail); ok = false; }
    if (!root.querySelector("#b-consent").checked) { setErr("consent", T.errConsent); ok = false; }
    return ok;
  }

  function buildPayload() {
    return {
      type: T.types[state.type],
      date: isoDate(state.date),
      start: fmtTime(state.start),
      end: fmtTime(state.start + SLOT_MINUTES),
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      status: "PENDING - awaiting clinic confirmation",
      language: lang
    };
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
    const p = buildPayload();
    const submit = root.querySelector("#booking-submit");

    if (!ENDPOINT) {
      const body = [
        `Type: ${p.type}`, `Date: ${p.date}`, `Time: ${p.start} - ${p.end}`,
        `Full name: ${p.name}`, `Phone: ${p.phone}`, `Email: ${p.email || "Not provided"}`,
        `Status: ${p.status}`
      ].join("\r\n");
      window.location.href = `mailto:${CLINIC_EMAIL}?subject=${encodeURIComponent(`${T.subject}: ${p.date} ${p.start}`)}&body=${encodeURIComponent(body)}`;
      showResult("", T.mailText, false);
      return;
    }

    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = T.sending;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(p)
      });
      if (!res.ok) throw new Error(res.status);
      form.reset();
      state.date = null; state.start = null; state.type = "consultation";
      daysEl.querySelectorAll(".booking-day").forEach(b => b.setAttribute("aria-pressed", "false"));
      renderSlots();
      renderSummary();
      showResult(T.okTitle, T.okText, false);
    } catch (err) {
      showResult("", T.sendError, true);
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });

  renderSlots();
})();
