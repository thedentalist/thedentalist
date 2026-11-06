/**
 * The Dentalist – online appointment backend (Google Apps Script + Google Calendar)
 *
 * Runs as a Web App on the clinic's Google account (thedentalist.hu@gmail.com).
 * Every appointment is an event in the dedicated "The Dentalist – Időpontok" calendar.
 * ANY event in that calendar blocks its time on the website, so the clinic can also
 * block time (holiday, break, phone booking) simply by adding an event there.
 *
 *   GET  ?action=slots             -> free slots for the next DAYS_AHEAD days (JSON)
 *   POST {action:"book", ...}      -> holds the slot as a PENDING event, emails the clinic
 *   GET  ?action=review&id=&sig=   -> clinic page with "Confirm" / "Decline" buttons
 *
 * Setup: see backend/README.md. Run setup() once from the editor.
 */

// ---------------------------------------------------------------- settings
const TZ = 'Europe/Budapest';
const SLOT_MINUTES = 60;
const DAYS_AHEAD = 28;
const MIN_LEAD_MINUTES = 120;           // earliest bookable slot: 2 hours from now
const MAX_REQUESTS_PER_PHONE_PER_DAY = 3;
const CLINIC_PHONE = '+36 30 252 5092';
const CALENDAR_NAME = 'The Dentalist – Időpontok';

// Opening hours, minutes from midnight, by weekday (0 = Sunday … 6 = Saturday).
// Use null for a closed day. Keep in step with the hours table on contact.html.
const HOURS = {
  0: [600, 1080],   // Sunday     10:00–18:00
  1: [510, 1200],   // Monday      8:30–20:00
  2: [510, 1200],   // Tuesday     8:30–20:00
  3: [510, 1200],   // Wednesday   8:30–20:00
  4: [510, 1200],   // Thursday    8:30–20:00
  5: [510, 1200],   // Friday      8:30–20:00
  6: [600, 1080]    // Saturday   10:00–18:00
};

// ---------------------------------------------------------------- setup
/** Run once from the Apps Script editor. Creates the calendar, secret and daily cleanup. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let cal = props.getProperty('CALENDAR_ID') && CalendarApp.getCalendarById(props.getProperty('CALENDAR_ID'));
  if (!cal) {
    cal = CalendarApp.getCalendarsByName(CALENDAR_NAME)[0] || CalendarApp.createCalendar(CALENDAR_NAME, { timeZone: TZ, color: CalendarApp.Color.YELLOW });
    props.setProperty('CALENDAR_ID', cal.getId());
  }
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty('CLINIC_EMAIL')) props.setProperty('CLINIC_EMAIL', Session.getEffectiveUser().getEmail());
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'dailyCleanup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyCleanup').timeBased().everyDays(1).atHour(3).inTimezone(TZ).create();
  Logger.log('Calendar: %s\nNotifications to: %s', cal.getName(), props.getProperty('CLINIC_EMAIL'));
}

// ---------------------------------------------------------------- web entry points
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'slots') return json_({ ok: true, tz: TZ, slotMinutes: SLOT_MINUTES, days: freeDays_() });
  if (p.action === 'review') return reviewPage_(p.id, p.sig);
  return json_({ ok: false, error: 'unknown_action' });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  if (d.action !== 'book') return json_({ ok: false, error: 'unknown_action' });
  return json_(book_(d));
}

// ---------------------------------------------------------------- availability
function calendar_() {
  const cal = CalendarApp.getCalendarById(PropertiesService.getScriptProperties().getProperty('CALENDAR_ID'));
  if (!cal) throw new Error('Calendar not found - run setup()');
  return cal;
}

function at_(dateStr, minutes) {
  const hh = ('0' + Math.floor(minutes / 60)).slice(-2), mm = ('0' + (minutes % 60)).slice(-2);
  return Utilities.parseDate(dateStr + ' ' + hh + ':' + mm, TZ, 'yyyy-MM-dd HH:mm');
}

function hhmm_(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }

/** Returns [{date:'2026-11-09', weekday:1, slots:['08:30', …]}] for every open day in range. */
function freeDays_() {
  const now = new Date();
  const earliest = now.getTime() + MIN_LEAD_MINUTES * 60000;
  const noonToday = Utilities.parseDate(Utilities.formatDate(now, TZ, 'yyyy-MM-dd') + ' 12:00', TZ, 'yyyy-MM-dd HH:mm');
  const rangeEnd = new Date(noonToday.getTime() + (DAYS_AHEAD + 1) * 86400000);
  const busy = calendar_().getEvents(now, rangeEnd).map(ev => [ev.getStartTime().getTime(), ev.getEndTime().getTime()]);

  const out = [];
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const noon = new Date(noonToday.getTime() + i * 86400000);
    const date = Utilities.formatDate(noon, TZ, 'yyyy-MM-dd');
    const weekday = Number(Utilities.formatDate(noon, TZ, 'u')) % 7;
    const hours = HOURS[weekday];
    if (!hours) continue;
    const slots = [];
    for (let m = hours[0]; m + SLOT_MINUTES <= hours[1]; m += SLOT_MINUTES) {
      const s = at_(date, m).getTime(), en = s + SLOT_MINUTES * 60000;
      if (s < earliest) continue;
      if (busy.some(b => b[0] < en && b[1] > s)) continue;
      slots.push(hhmm_(m));
    }
    out.push({ date: date, weekday: weekday, slots: slots });
  }
  return out;
}

// ---------------------------------------------------------------- booking
function clean_(v, max) {
  return (typeof v === 'string' ? v : '').replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, max);
}

function book_(d) {
  if (d.website) return { ok: true };                      // honeypot filled in: silently ignore bots
  const lang = d.language === 'en' ? 'en' : 'hu';
  const date = clean_(d.date, 10), start = clean_(d.start, 5);
  const name = clean_(d.name, 120), phone = clean_(d.phone, 30), email = clean_(d.email, 254);
  const digits = phone.replace(/\D/g, '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !name || digits.length < 7 || d.consent !== true ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { ok: false, error: 'invalid' };
  }

  const cache = CacheService.getScriptCache();
  const rateKey = 'phone:' + digits;
  const count = Number(cache.get(rateKey) || 0);
  if (count >= MAX_REQUESTS_PER_PHONE_PER_DAY) return { ok: false, error: 'too_many' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'busy' };
  let ev;
  try {
    const day = freeDays_().filter(x => x.date === date)[0];
    if (!day || day.slots.indexOf(start) === -1) return { ok: false, error: 'taken' };
    const startMin = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
    ev = calendar_().createEvent('⏳ FÜGGŐBEN – ' + name, at_(date, startMin), at_(date, startMin + SLOT_MINUTES), {
      description: [
        'ONLINE IDŐPONTKÉRÉS – FÜGGŐBEN (még nincs visszaigazolva)',
        'Név: ' + name, 'Telefon: ' + phone, 'E-mail: ' + (email || '–'),
        'Nyelv: ' + lang.toUpperCase(), 'Beérkezett: ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')
      ].join('\n')
    });
    ev.setColor(CalendarApp.EventColor.YELLOW);
    ev.setTag('status', 'pending');
    ev.setTag('name', name); ev.setTag('phone', phone); ev.setTag('email', email); ev.setTag('lang', lang);
  } finally {
    lock.releaseLock();
  }
  cache.put(rateKey, String(count + 1), 86400);

  notifyClinic_(ev);
  if (email) mailPatient_(ev, 'received');
  return { ok: true };
}

// ---------------------------------------------------------------- clinic review (confirm / decline)
function sign_(id) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(id, secret)).replace(/=+$/, '');
}

function reviewUrl_(ev) {
  return ScriptApp.getService().getUrl() + '?action=review&id=' + encodeURIComponent(ev.getId()) + '&sig=' + sign_(ev.getId());
}

function when_(ev, lang) {
  const s = ev.getStartTime(), e = ev.getEndTime();
  const date = lang === 'en' ? Utilities.formatDate(s, TZ, 'EEEE, d MMMM yyyy') : Utilities.formatDate(s, TZ, 'yyyy.MM.dd.');
  return date + ', ' + Utilities.formatDate(s, TZ, 'HH:mm') + '–' + Utilities.formatDate(e, TZ, 'HH:mm');
}

function esc_(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function notifyClinic_(ev) {
  const t = k => ev.getTag(k) || '';
  const url = reviewUrl_(ev);
  const html =
    '<p><b>Új online időpontkérés – FÜGGŐBEN</b></p>' +
    '<p>Időpont: <b>' + esc_(when_(ev, 'hu')) + '</b><br>Név: ' + esc_(t('name')) + '<br>Telefon: ' + esc_(t('phone')) +
    '<br>E-mail: ' + esc_(t('email') || '–') + '<br>Nyelv: ' + esc_(t('lang').toUpperCase()) + '</p>' +
    '<p>Az időpont a naptárban már foglalt (sárga). Visszaigazolás vagy elutasítás:</p>' +
    '<p><a href="' + url + '" style="background:#d9a900;color:#000;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Megnyitás: visszaigazolás / elutasítás</a></p>' +
    (t('email') ? '' : '<p><i>A páciens nem adott meg e-mail-címet – kérjük, hívja vissza telefonon.</i></p>');
  MailApp.sendEmail({
    to: PropertiesService.getScriptProperties().getProperty('CLINIC_EMAIL'),
    subject: 'Időpontkérés: ' + when_(ev, 'hu') + ' – ' + t('name'),
    htmlBody: html,
    replyTo: t('email') || undefined,
    name: 'The Dentalist weboldal'
  });
}

function reviewPage_(id, sig) {
  const ok = id && sig && sig === sign_(id);
  const ev = ok ? calendar_().getEventById(id) : null;
  const tpl = HtmlService.createTemplate(
    '<!DOCTYPE html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:system-ui,sans-serif;background:#000;color:#f5f5f5;max-width:34rem;margin:2rem auto;padding:0 1rem}' +
    'h1{color:#d9a900;font-size:1.3rem}button{font-size:1rem;padding:.7rem 1.2rem;border-radius:.5rem;border:0;margin:.3rem .3rem 0 0;cursor:pointer}' +
    '.ok{background:#d9a900;color:#000;font-weight:600}.no{background:#333;color:#fff}#msg{margin-top:1rem}</style></head><body>' +
    '<h1>The Dentalist – időpontkérés</h1>' +
    '<? if (!ev) { ?><p>Ez az időpontkérés már nem létezik (elutasították vagy törölték a naptárból).</p>' +
    '<? } else { ?><p><b><?= when ?></b><br><?= name ?><br><?= phone ?><br><?= email || "nincs e-mail" ?></p>' +
    '<? if (status === "approved") { ?><p>✅ Ez az időpont már vissza van igazolva.</p><? } else { ?>' +
    '<div id="btns"><button class="ok" onclick="act(\'approve\')">✅ Visszaigazolom</button>' +
    '<button class="no" onclick="act(\'decline\')">✖ Elutasítom (az időpont felszabadul)</button></div><? } ?>' +
    '<div id="msg"></div><script>function act(a){document.getElementById("btns").style.display="none";' +
    'document.getElementById("msg").textContent="Folyamatban…";google.script.run.withSuccessHandler(function(m){document.getElementById("msg").textContent=m})' +
    '.withFailureHandler(function(e){document.getElementById("msg").textContent="Hiba: "+e.message})' +
    '.review(<?!= JSON.stringify(id) ?>,<?!= JSON.stringify(sig) ?>,a)}</script><? } ?></body></html>');
  tpl.ev = ev; tpl.id = id; tpl.sig = sig;
  if (ev) {
    tpl.when = when_(ev, 'hu'); tpl.name = ev.getTag('name'); tpl.phone = ev.getTag('phone');
    tpl.email = ev.getTag('email'); tpl.status = ev.getTag('status');
  }
  return tpl.evaluate().setTitle('Időpontkérés').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Called from the review page via google.script.run. */
function review(id, sig, action) {
  if (!id || sig !== sign_(id)) throw new Error('Érvénytelen link');
  const ev = calendar_().getEventById(id);
  if (!ev) return 'Ez az időpontkérés már nem létezik.';
  const name = ev.getTag('name'), email = ev.getTag('email'), phone = ev.getTag('phone');
  if (action === 'approve') {
    if (ev.getTag('status') === 'approved') return 'Már vissza volt igazolva.';
    ev.setTitle('✅ ' + name);
    ev.setDescription(ev.getDescription().replace('FÜGGŐBEN (még nincs visszaigazolva)', 'VISSZAIGAZOLVA ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')));
    ev.setColor(CalendarApp.EventColor.GREEN);
    ev.setTag('status', 'approved');
    if (email) { mailPatient_(ev, 'approved'); return 'Visszaigazolva. A páciens e-mailt kapott.'; }
    return 'Visszaigazolva. A páciens nem adott meg e-mailt – kérjük, hívja fel: ' + phone;
  }
  if (action === 'decline') {
    if (email) mailPatient_(ev, 'declined');
    ev.deleteEvent();
    return email ? 'Elutasítva, az időpont felszabadult. A páciens e-mailt kapott.'
                 : 'Elutasítva, az időpont felszabadult. Kérjük, értesítse telefonon: ' + phone;
  }
  throw new Error('Ismeretlen művelet');
}

// ---------------------------------------------------------------- patient emails
function mailPatient_(ev, kind) {
  const lang = ev.getTag('lang') === 'en' ? 'en' : 'hu';
  const name = ev.getTag('name'), when = when_(ev, lang);
  const M = {
    hu: {
      received: ['Időpontkérését megkaptuk – még nincs visszaigazolva',
        'Kedves ' + name + '!\n\nMegkaptuk időpontkérését: ' + when + '.\nAz időpontot ideiglenesen fenntartjuk Önnek, de még NINCS visszaigazolva. Munkatársunk legfeljebb 24 órán belül visszaigazolja, vagy egyeztet Önnel.'],
      approved: ['Időpontja visszaigazolva: ' + when,
        'Kedves ' + name + '!\n\nÖrömmel visszaigazoljuk időpontját: ' + when + '.\nCím: 1134 Budapest, Angyalföldi út 30-32., B lépcsőház, földszint 6. ajtó (2-es kapucsengő).\nHa mégsem tud eljönni, kérjük, jelezze minél előbb válaszlevélben vagy telefonon.'],
      declined: ['A kért időpont sajnos nem elérhető',
        'Kedves ' + name + '!\n\nSajnos a kért időpont (' + when + ') nem elérhető. Kérjük, válasszon másik időpontot a weboldalon (https://thedentalist.hu/contact.html), vagy hívjon minket.'],
      sign: '\n\nÜdvözlettel:\nThe Dentalist fogászat\n' + CLINIC_PHONE
    },
    en: {
      received: ['We received your appointment request – not yet confirmed',
        'Dear ' + name + ',\n\nWe received your appointment request for ' + when + '.\nWe are holding this time for you, but it is NOT confirmed yet. Our team will confirm it or contact you within 24 hours at the latest.'],
      approved: ['Your appointment is confirmed: ' + when,
        'Dear ' + name + ',\n\nWe are happy to confirm your appointment on ' + when + '.\nAddress: 1134 Budapest, Angyalföldi út 30-32., staircase B, ground floor, door 6 (doorbell 2).\nIf you cannot come, please let us know as soon as possible by replying to this email or by phone.'],
      declined: ['Your requested time is unfortunately not available',
        'Dear ' + name + ',\n\nUnfortunately the time you requested (' + when + ') is not available. Please choose another time on our website (https://thedentalist.hu/en/contact.html) or call us.'],
      sign: '\n\nKind regards,\nThe Dentalist dental clinic\n' + CLINIC_PHONE
    }
  }[lang];
  MailApp.sendEmail({
    to: ev.getTag('email'),
    subject: M[kind][0],
    body: M[kind][1] + M.sign,
    name: 'The Dentalist',
    replyTo: PropertiesService.getScriptProperties().getProperty('CLINIC_EMAIL')
  });
}

// ---------------------------------------------------------------- housekeeping
/** Daily: deletes requests that were never confirmed and whose time has passed. */
function dailyCleanup() {
  const cal = calendar_();
  const now = new Date();
  cal.getEvents(new Date(now.getTime() - 60 * 86400000), now)
    .filter(ev => ev.getTag('status') === 'pending')
    .forEach(ev => ev.deleteEvent());
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
