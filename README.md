# thedentalist
The Dentalist Website

## Online appointment requests

The Hungarian and English contact pages book appointments through a Google Apps Script
that stores them in the clinic's Google Calendar (`backend/Code.gs`). The page shows only
slots that are free in the calendar; a request holds the slot as pending until the clinic
confirms or declines it from the notification email. The script's Web App URL is the
`data-endpoint` attribute of the `#booking` element in `contact.html` and `en/contact.html`.
If it is empty, the form shows the clinic's phone number and email instead.

The form sends the requested date and time, name, phone number, optional email address
and language. It does not collect the type of treatment or any health information.
Setup and maintenance: see [backend/README.md](backend/README.md).
