# thedentalist
The Dentalist Website

## Online appointment requests

The Hungarian and English contact pages submit appointment requests to [Formspark](https://formspark.io), an EU-based form service (data stored in Ireland and Germany). The form's address is the `data-endpoint` attribute of the `#booking` element in `contact.html` and `en/contact.html`, in the form `https://submit-form.com/<form-id>`. If it is empty, the form opens the visitor's e-mail app instead. Requests are not confirmed automatically; the clinic reviews each one and confirms it with the patient.

The form sends the requested date and time, name, phone number, email address, request status, and language as JSON. It does not collect the type of treatment or any health information. Manage the notification recipient, spam protection and deletion of submissions in the Formspark dashboard.
