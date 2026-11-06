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
 *   GET  ?action=review&id=&sig=   -> clinic page: confirm / suggest another time / decline
 *   GET  ?action=respond&id=&sig=  -> patient page: accept / decline the suggested time
 *
 * Setup: see backend/README.md. Run setup() once from the editor.
 */

// ---------------------------------------------------------------- settings
const TZ = 'Europe/Budapest';
const SLOT_MINUTES = 60;
const DAYS_AHEAD = 28;
const MIN_LEAD_MINUTES = 120;           // earliest bookable slot: 2 hours from now
const MAX_REQUESTS_PER_PHONE_PER_DAY = 3;
// The website shows at most this many free times per day (picked at random but stable for the
// day), and hides days with no free time, so patients never see how empty or full the diary is.
// The clinic's review page always sees every free slot. Use 0 to show all free times.
const MAX_SLOTS_SHOWN = 4;
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
  if (p.action === 'slots') return json_({ ok: true, tz: TZ, slotMinutes: SLOT_MINUTES, days: freeDays_(false) });
  if (p.action === 'review') return reviewPage_(p.id, p.sig);
  if (p.action === 'respond') return respondPage_(p.id, p.sig);
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

/** Free slots per day: [{date:'2026-11-09', weekday:1, slots:['08:30', …]}].
 *  all=true: every open day and every free slot (clinic, validation).
 *  all=false: what the website shows (days with free time only, at most MAX_SLOTS_SHOWN each). */
function freeDays_(all) {
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
    if (all) out.push({ date: date, weekday: weekday, slots: slots });
    else if (slots.length) out.push({ date: date, weekday: weekday, slots: sample_(slots, date) });
  }
  return out;
}

/** Picks MAX_SLOTS_SHOWN slots, seeded by the date so a page reload shows the same times. */
function sample_(slots, date) {
  if (!MAX_SLOTS_SHOWN || slots.length <= MAX_SLOTS_SHOWN) return slots;
  let seed = Number(date.replace(/-/g, ''));
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  return slots.map(s => [rnd(), s]).sort((a, b) => a[0] - b[0]).slice(0, MAX_SLOTS_SHOWN).map(x => x[1]).sort();
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
    const day = freeDays_(true).filter(x => x.date === date)[0];
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

// ---------------------------------------------------------------- clinic review (confirm / suggest / decline)
// Event statuses (event tag "status"): pending -> approved | proposed -> approved; declined requests are deleted.
function sign_(id, who) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature((who || 'clinic') + ':' + id, secret)).replace(/=+$/, '');
}

function reviewUrl_(ev) {
  return ScriptApp.getService().getUrl() + '?action=review&id=' + encodeURIComponent(ev.getId()) + '&sig=' + sign_(ev.getId());
}

function respondUrl_(ev) {
  return ScriptApp.getService().getUrl() + '?action=respond&id=' + encodeURIComponent(ev.getId()) + '&sig=' + sign_(ev.getId(), 'patient');
}

function when_(ev, lang) {
  const s = ev.getStartTime(), e = ev.getEndTime();
  const date = lang === 'en' ? Utilities.formatDate(s, TZ, 'EEEE, d MMMM yyyy') : Utilities.formatDate(s, TZ, 'yyyy.MM.dd.');
  return date + ', ' + Utilities.formatDate(s, TZ, 'HH:mm') + '–' + Utilities.formatDate(e, TZ, 'HH:mm');
}

function esc_(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function clinicEmail_() { return PropertiesService.getScriptProperties().getProperty('CLINIC_EMAIL'); }

function notifyClinic_(ev) {
  const t = k => ev.getTag(k) || '';
  const url = reviewUrl_(ev);
  const html =
    '<p><b>Új online időpontkérés – FÜGGŐBEN</b></p>' +
    '<p>Időpont: <b>' + esc_(when_(ev, 'hu')) + '</b><br>Név: ' + esc_(t('name')) + '<br>Telefon: ' + esc_(t('phone')) +
    '<br>E-mail: ' + esc_(t('email') || '–') + '<br>Nyelv: ' + esc_(t('lang').toUpperCase()) + '</p>' +
    '<p>Az időpont a naptárban már foglalt (sárga). Visszaigazolás, másik időpont javaslata vagy elutasítás:</p>' +
    '<p><a href="' + url + '" style="background:#d9a900;color:#000;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Megnyitás</a></p>' +
    (t('email') ? '' : '<p><i>A páciens nem adott meg e-mail-címet – kérjük, hívja vissza telefonon.</i></p>');
  MailApp.sendEmail({
    to: clinicEmail_(),
    subject: 'Időpontkérés: ' + when_(ev, 'hu') + ' – ' + t('name'),
    htmlBody: html,
    replyTo: t('email') || undefined,
    name: 'The Dentalist weboldal'
  });
}

const PAGE_CSS_ = '<style>body{font-family:system-ui,sans-serif;background:#000;color:#f5f5f5;max-width:34rem;margin:2rem auto;padding:0 1rem;line-height:1.45}' +
  'h1{color:#d9a900;font-size:1.3rem}h2{color:#c9a94d;font-size:1rem;margin-top:1.6rem}button{font-size:1rem;padding:.7rem 1.2rem;border-radius:.5rem;border:0;margin:.3rem .3rem 0 0;cursor:pointer}' +
  '.ok{background:#d9a900;color:#000;font-weight:600}.no{background:#333;color:#fff}select,textarea{font:inherit;width:100%;padding:.5rem;border-radius:.4rem;border:1px solid #555;background:#111;color:#f5f5f5;margin:.25rem 0 .5rem}' +
  '.note{color:#aaa;font-size:.9rem}#msg{margin-top:1rem;color:#8fe3a5}</style>';

/** Wraps page markup with shared CSS and a tiny helper that calls a server function. */
function page_(title, body, call) {
  const html = '<!DOCTYPE html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1">' + PAGE_CSS_ + '</head><body>' +
    body + '<div id="msg"></div><script>function run(){var a=[].slice.call(arguments);var b=document.getElementById("btns");if(b)b.style.display="none";' +
    'document.getElementById("msg").textContent="…";var r=google.script.run.withSuccessHandler(function(m){document.getElementById("msg").textContent=m})' +
    '.withFailureHandler(function(e){document.getElementById("msg").textContent="Hiba / Error: "+e.message;if(b)b.style.display=""});r[' + JSON.stringify(call) + '].apply(r,a)}</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function reviewPage_(id, sig) {
  const ev = id && sig === sign_(id) ? calendar_().getEventById(id) : null;
  if (!ev) return page_('Időpontkérés', '<h1>The Dentalist – időpontkérés</h1><p>Ez az időpontkérés már nem létezik (elutasították vagy törölték a naptárból).</p>', 'review');
  const t = k => ev.getTag(k) || '', status = t('status'), hasEmail = !!t('email');
  const J = v => JSON.stringify(v).replace(/</g, '\\u003c');
  const days = freeDays_(true).filter(d => d.slots.length);
  let body = '<h1>The Dentalist – időpontkérés</h1><p><b>' + esc_(when_(ev, 'hu')) + '</b><br>' + esc_(t('name')) + '<br>' + esc_(t('phone')) + '<br>' + esc_(t('email') || 'nincs e-mail') + '</p>';
  if (status === 'approved') return page_('Időpontkérés', body + '<p>✅ Ez az időpont már vissza van igazolva.</p>', 'review');
  if (status === 'proposed') body += '<p>🔄 Másik időpontot javasoltunk, a páciens válaszára vár. Közben módosíthatja vagy elutasíthatja.</p>';
  body += '<script>var ID=' + J(id) + ',SIG=' + J(sig) + ';</script><div id="btns">' +
    (status === 'pending' ? '<button class="ok" onclick="run(ID,SIG,\'approve\',null)">✅ Visszaigazolom</button>' : '') +
    '<button class="no" onclick="run(ID,SIG,\'decline\',null)">✖ Elutasítom (az időpont felszabadul)</button>' +
    '<h2>🔄 Másik időpontot javaslok</h2>' +
    (days.length ? '<select id="day" onchange="fill()"></select><select id="time"></select>' +
      (hasEmail ? '<textarea id="note" rows="2" maxlength="300" placeholder="Üzenet a páciensnek (nem kötelező)"></textarea>' +
        '<p class="note">A páciens e-mailben megkapja a javaslatot, és egy kattintással elfogadhatja vagy elutasíthatja. Az eredeti időpont felszabadul, az új időpontot neki tartjuk fenn.</p>' +
        '<button class="ok" onclick="propose()">Javaslat elküldése</button>'
      : '<p class="note">A páciens nem adott meg e-mailt. Telefonon egyeztessen vele, majd helyezze át az időpontot – ez egyben vissza is igazolja.</p>' +
        '<button class="ok" onclick="propose()">Áthelyezés és visszaigazolás (telefonon egyeztettem)</button>')
      : '<p class="note">A következő hetekben nincs szabad időpont.</p>') +
    '</div><script>var DAYS=' + J(days) + ';var D=document.getElementById("day"),T=document.getElementById("time");' +
    'var N=["vasárnap","hétfő","kedd","szerda","csütörtök","péntek","szombat"];' +
    'if(D){DAYS.forEach(function(d){var o=document.createElement("option");o.value=d.date;o.textContent=d.date.replace(/-/g,".")+". "+N[d.weekday];D.appendChild(o)});fill()}' +
    'function fill(){var d=DAYS.filter(function(x){return x.date===D.value})[0];T.innerHTML="";d.slots.forEach(function(s){var o=document.createElement("option");o.value=o.textContent=s;T.appendChild(o)})}' +
    'function propose(){var n=document.getElementById("note");run(ID,SIG,"propose",{date:D.value,start:T.value,note:n?n.value:""})}</script>';
  return page_('Időpontkérés', body, 'review');
}

/** Called from the clinic review page via google.script.run. */
function review(id, sig, action, extra) {
  if (!id || sig !== sign_(id)) throw new Error('Érvénytelen link');
  const ev = calendar_().getEventById(id);
  if (!ev) return 'Ez az időpontkérés már nem létezik.';
  const name = ev.getTag('name'), email = ev.getTag('email'), phone = ev.getTag('phone');
  if (ev.getTag('status') === 'approved' && action !== 'decline') return 'Már vissza volt igazolva.';
  if (action === 'approve') {
    approve_(ev, 'VISSZAIGAZOLVA');
    if (email) { mailPatient_(ev, 'approved'); return 'Visszaigazolva. A páciens e-mailt kapott.'; }
    return 'Visszaigazolva. A páciens nem adott meg e-mailt – kérjük, hívja fel: ' + phone;
  }
  if (action === 'decline') {
    if (email) mailPatient_(ev, 'declined');
    ev.deleteEvent();
    return email ? 'Elutasítva, az időpont felszabadult. A páciens e-mailt kapott.'
                 : 'Elutasítva, az időpont felszabadult. Kérjük, értesítse telefonon: ' + phone;
  }
  if (action === 'propose') {
    const date = clean_(extra && extra.date, 10), start = clean_(extra && extra.start, 5), note = clean_(extra && extra.note, 300);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw new Error('Próbálja újra');
    try {
      const day = freeDays_(true).filter(x => x.date === date)[0];
      if (!day || day.slots.indexOf(start) === -1) return 'Ez az időpont közben foglalt lett – frissítse az oldalt, és válasszon másikat.';
      const m = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
      if (!ev.getTag('requested')) ev.setTag('requested', when_(ev, ev.getTag('lang')));
      ev.setTime(at_(date, m), at_(date, m + SLOT_MINUTES));
    } finally {
      lock.releaseLock();
    }
    if (!email) {
      approve_(ev, 'ÁTHELYEZVE ÉS VISSZAIGAZOLVA (telefonon)');
      return 'Áthelyezve és visszaigazolva: ' + when_(ev, 'hu') + '.';
    }
    ev.setTitle('🔄 JAVASOLT – ' + name);
    ev.setColor(CalendarApp.EventColor.ORANGE);
    ev.setTag('status', 'proposed');
    ev.setDescription(ev.getDescription().replace(/^ONLINE IDŐPONTKÉRÉS – .*$/m, 'ONLINE IDŐPONTKÉRÉS – MÁSIK IDŐPONT JAVASOLVA, a páciens válaszára vár (kért: ' + ev.getTag('requested') + ')'));
    mailPatient_(ev, 'proposed', note);
    return 'Javaslat elküldve: ' + when_(ev, 'hu') + '. Ha a páciens elfogadja vagy elutasítja, e-mailt kap róla.';
  }
  throw new Error('Ismeretlen művelet');
}

function approve_(ev, label) {
  ev.setTitle('✅ ' + ev.getTag('name'));
  ev.setDescription(ev.getDescription().replace(/^ONLINE IDŐPONTKÉRÉS – .*$/m, 'ONLINE IDŐPONTKÉRÉS – ' + label + ' ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')));
  ev.setColor(CalendarApp.EventColor.GREEN);
  ev.setTag('status', 'approved');
}

// ---------------------------------------------------------------- patient answers a suggested time
function respondPage_(id, sig) {
  const ev = id && sig === sign_(id, 'patient') ? calendar_().getEventById(id) : null;
  const lang = ev && ev.getTag('lang') === 'en' ? 'en' : 'hu';
  const L = lang === 'en'
    ? { title: 'The Dentalist – suggested appointment', gone: 'This suggestion is no longer available. Please book a new time on our website or call us on ' + CLINIC_PHONE + '.',
        done: '✅ This appointment is already confirmed.', intro: 'Instead of the time you requested, we suggest:', yes: '✅ I accept this time', no: '✖ This time does not suit me' }
    : { title: 'The Dentalist – javasolt időpont', gone: 'Ez a javaslat már nem érvényes. Kérjük, foglaljon új időpontot a weboldalon, vagy hívjon minket: ' + CLINIC_PHONE + '.',
        done: '✅ Ez az időpont már vissza van igazolva.', intro: 'A kért időpont helyett ezt javasoljuk:', yes: '✅ Elfogadom ezt az időpontot', no: '✖ Ez az időpont nem jó nekem' };
  let body = '<h1>' + L.title + '</h1>';
  if (!ev || (ev.getTag('status') !== 'proposed' && ev.getTag('status') !== 'approved')) return page_(L.title, body + '<p>' + L.gone + '</p>', 'respond');
  if (ev.getTag('status') === 'approved') return page_(L.title, body + '<p><b>' + esc_(when_(ev, lang)) + '</b></p><p>' + L.done + '</p>', 'respond');
  const J = v => JSON.stringify(v).replace(/</g, '\\u003c');
  body += '<script>var ID=' + J(id) + ',SIG=' + J(sig) + ';</script><p>' + L.intro + '</p><p><b>' + esc_(when_(ev, lang)) + '</b></p><div id="btns">' +
    '<button class="ok" onclick="run(ID,SIG,\'accept\')">' + L.yes + '</button>' +
    '<button class="no" onclick="run(ID,SIG,\'reject\')">' + L.no + '</button></div>';
  return page_(L.title, body, 'respond');
}

/** Called from the patient page via google.script.run. */
function respond(id, sig, answer) {
  if (!id || sig !== sign_(id, 'patient')) throw new Error('Invalid link');
  const ev = calendar_().getEventById(id);
  const en = ev && ev.getTag('lang') === 'en';
  if (!ev || ev.getTag('status') !== 'proposed') {
    return en ? 'This suggestion is no longer available. Please call us on ' + CLINIC_PHONE + '.' : 'Ez a javaslat már nem érvényes. Kérjük, hívjon minket: ' + CLINIC_PHONE + '.';
  }
  const name = ev.getTag('name'), when = when_(ev, 'hu');
  if (answer === 'accept') {
    approve_(ev, 'A PÁCIENS ELFOGADTA A JAVASOLT IDŐPONTOT');
    mailPatient_(ev, 'approved');
    MailApp.sendEmail({ to: clinicEmail_(), name: 'The Dentalist weboldal', subject: '✅ Elfogadta: ' + name + ' – ' + when,
      body: name + ' elfogadta a javasolt időpontot: ' + when + '.\nAz időpont a naptárban visszaigazolt (zöld), a páciens visszaigazoló e-mailt kapott.' });
    return en ? 'Thank you! Your appointment is confirmed: ' + when_(ev, 'en') + '. We have sent you a confirmation email.'
              : 'Köszönjük! Időpontja visszaigazolva: ' + when + '. Visszaigazoló e-mailt küldtünk.';
  }
  if (answer === 'reject') {
    const phone = ev.getTag('phone');
    ev.deleteEvent();
    MailApp.sendEmail({ to: clinicEmail_(), name: 'The Dentalist weboldal', subject: '✖ Nem fogadta el: ' + name + ' – ' + when,
      body: name + ' nem fogadta el a javasolt időpontot (' + when + '). Az időpont felszabadult.\nTelefon: ' + phone });
    return en ? 'Thank you for letting us know. Please choose another time on our website (https://thedentalist.hu/en/contact.html) or call us on ' + CLINIC_PHONE + '.'
              : 'Köszönjük a visszajelzést. Kérjük, válasszon másik időpontot a weboldalon (https://thedentalist.hu/contact.html), vagy hívjon minket: ' + CLINIC_PHONE + '.';
  }
  throw new Error('Unknown answer');
}

// ---------------------------------------------------------------- patient emails
function mailPatient_(ev, kind, note) {
  const lang = ev.getTag('lang') === 'en' ? 'en' : 'hu';
  const name = ev.getTag('name'), when = when_(ev, lang);
  const requested = ev.getTag('requested') || '';
  const extra = note ? '\n\n' + (lang === 'en' ? 'Message from the clinic: ' : 'Üzenet a rendelőtől: ') + note : '';
  const M = {
    hu: {
      received: ['Időpontkérését megkaptuk – még nincs visszaigazolva',
        'Kedves ' + name + '!\n\nMegkaptuk időpontkérését: ' + when + '.\nAz időpontot ideiglenesen fenntartjuk Önnek, de még NINCS visszaigazolva. Munkatársunk legfeljebb 24 órán belül visszaigazolja, vagy egyeztet Önnel.'],
      approved: ['Időpontja visszaigazolva: ' + when,
        'Kedves ' + name + '!\n\nÖrömmel visszaigazoljuk időpontját: ' + when + '.\nCím: 1134 Budapest, Angyalföldi út 30-32., B lépcsőház, földszint 6. ajtó (2-es kapucsengő).\nHa mégsem tud eljönni, kérjük, jelezze minél előbb válaszlevélben vagy telefonon.'],
      declined: ['A kért időpont sajnos nem elérhető',
        'Kedves ' + name + '!\n\nSajnos a kért időpont (' + when + ') nem elérhető. Kérjük, válasszon másik időpontot a weboldalon (https://thedentalist.hu/contact.html), vagy hívjon minket.'],
      proposed: ['Másik időpontot javaslunk: ' + when,
        'Kedves ' + name + '!\n\nA kért időpont (' + requested + ') sajnos nem megfelelő, ezért helyette ezt javasoljuk:\n\n    ' + when + extra +
        '\n\nAz időpontot addig fenntartjuk Önnek. Kérjük, itt fogadja el vagy utasítsa el:\n' + respondUrl_(ev) +
        '\n\nAz időpont csak az elfogadás után válik érvényessé. Ha kérdése van, válaszoljon erre a levélre, vagy hívjon minket.'],
      sign: '\n\nÜdvözlettel:\nThe Dentalist fogászat\n' + CLINIC_PHONE
    },
    en: {
      received: ['We received your appointment request – not yet confirmed',
        'Dear ' + name + ',\n\nWe received your appointment request for ' + when + '.\nWe are holding this time for you, but it is NOT confirmed yet. Our team will confirm it or contact you within 24 hours at the latest.'],
      approved: ['Your appointment is confirmed: ' + when,
        'Dear ' + name + ',\n\nWe are happy to confirm your appointment on ' + when + '.\nAddress: 1134 Budapest, Angyalföldi út 30-32., staircase B, ground floor, door 6 (doorbell 2).\nIf you cannot come, please let us know as soon as possible by replying to this email or by phone.'],
      declined: ['Your requested time is unfortunately not available',
        'Dear ' + name + ',\n\nUnfortunately the time you requested (' + when + ') is not available. Please choose another time on our website (https://thedentalist.hu/en/contact.html) or call us.'],
      proposed: ['We suggest another time: ' + when,
        'Dear ' + name + ',\n\nUnfortunately the time you requested (' + requested + ') does not work for us, so we suggest this time instead:\n\n    ' + when + extra +
        '\n\nWe are holding this time for you. Please accept or decline it here:\n' + respondUrl_(ev) +
        '\n\nThe appointment is confirmed only once you accept it. If you have any questions, reply to this email or call us.'],
      sign: '\n\nKind regards,\nThe Dentalist dental clinic\n' + CLINIC_PHONE
    }
  }[lang];
  MailApp.sendEmail({
    to: ev.getTag('email'),
    subject: M[kind][0],
    body: M[kind][1] + M.sign,
    name: 'The Dentalist',
    replyTo: clinicEmail_()
  });
}

// ---------------------------------------------------------------- housekeeping
/** Daily: deletes requests (pending or suggested) that were never confirmed and whose time has passed. */
function dailyCleanup() {
  const cal = calendar_();
  const now = new Date();
  cal.getEvents(new Date(now.getTime() - 60 * 86400000), now)
    .filter(ev => ev.getTag('status') === 'pending' || ev.getTag('status') === 'proposed')
    .forEach(ev => ev.deleteEvent());
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
