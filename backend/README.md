# Online booking backend (Google Calendar)

The website is static, so bookings go to a small Google Apps Script that runs on the
clinic's Google account and stores every appointment in a Google Calendar.

How it works:

1. The contact page asks the script for free slots. A slot is free if it's within the
   opening hours (`HOURS` in `Code.gs`), at least 2 hours from now, and **no event in the
   calendar overlaps it**.
2. When a patient sends a request, the script checks the slot again and creates a yellow
   event: `⏳ FÜGGŐBEN – <name>`. The slot is now held, so nobody else can book it.
3. The clinic gets an email with a button. That opens a page with **Visszaigazolom**
   (confirm) or **Elutasítom** (decline).
   - Confirm: the event turns green (`✅ <name>`) and the patient gets a confirmation email.
   - Decline: the event is deleted, the slot is free again and the patient gets an email.
   - If the patient left no email address, the page reminds you to call them.
4. Once a day, requests that were never confirmed and whose time has passed are deleted.

To block time (holiday, lunch break, a phone booking), add an event of any kind to the
**The Dentalist – Időpontok** calendar. You can also move or delete appointments there.

## One-time setup (about 10 minutes)

1. Sign in to Google as **thedentalist.hu@gmail.com** and open https://script.google.com.
2. **New project**, name it `The Dentalist booking`.
3. Replace the contents of `Code.gs` with the file `backend/Code.gs` from this repository.
4. Project Settings (gear icon): set **Time zone** to `(GMT+01:00) Budapest`.
5. In the editor, select the `setup` function and click **Run**. Allow the permissions
   it asks for (Calendar, Gmail sending, triggers). This creates the calendar
   *The Dentalist – Időpontok*, the signing secret and the daily cleanup.
6. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   Copy the Web app URL (ends with `/exec`).
7. Paste that URL into `data-endpoint="…"` on the `#booking` element in both
   `contact.html` and `en/contact.html`, and publish the site.
8. Test: book a slot on the website, check the yellow event and the email, then confirm it.

Notification emails go to the account running the script. To send them elsewhere, add
a Script Property `CLINIC_EMAIL` (Project Settings → Script properties).

## Changing the code later

After editing `Code.gs`, use **Deploy → Manage deployments → Edit → Version: New version**.
That keeps the same URL. A *new* deployment gets a new URL that must be pasted into the
website again.

Opening hours, slot length (`SLOT_MINUTES`), how far ahead patients can book (`DAYS_AHEAD`)
and the minimum notice (`MIN_LEAD_MINUTES`) are at the top of `Code.gs`. Keep the hours
table on the contact pages in step with `HOURS`.

## Limits

The free Gmail account can send about 100 emails a day through Apps Script. Each request
uses one to three emails, which is plenty for the clinic's volume.
