<?php
// Receives appointment requests (JSON) from assets/booking.js and emails them to the clinic.
// The From address must be a real mailbox on this domain, otherwise hosts reject or spam-flag the mail.
const CLINIC_EMAIL = 'info@thedentalist.hu';
const FROM_EMAIL = 'info@thedentalist.hu';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo '{"ok":false}';
    exit;
}

$d = json_decode(file_get_contents('php://input'), true);
if (!is_array($d)) {
    http_response_code(400);
    echo '{"ok":false}';
    exit;
}

// Strip control characters/newlines so values cannot inject mail headers.
function clean($v, $max)
{
    $v = is_string($v) ? $v : '';
    return mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v)), 0, $max);
}

$type = clean($d['type'] ?? '', 40);
$date = clean($d['date'] ?? '', 12);
$start = clean($d['start'] ?? '', 6);
$end = clean($d['end'] ?? '', 6);
$name = clean($d['name'] ?? '', 120);
$address = clean($d['address'] ?? '', 200);
$phone = clean($d['phone'] ?? '', 30);
$lang = clean($d['language'] ?? '', 5);

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{1,2}:\d{2}$/', $start) || $name === '' || $phone === '') {
    http_response_code(422);
    echo '{"ok":false}';
    exit;
}

$subject = "Appointment request: $date $start - $name";
$body = implode("\r\n", [
    'NEW APPOINTMENT REQUEST (not confirmed - please call or reply to the patient)',
    '',
    "Type: $type",
    "Date: $date",
    "Time: $start - $end",
    "Name: $name",
    "Phone: $phone",
    "Address: $address",
    "Language: $lang",
]);

$headers = [
    'From: The Dentalist website <' . FROM_EMAIL . '>',
    'Content-Type: text/plain; charset=UTF-8',
];

$ok = mail(CLINIC_EMAIL, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));
if (!$ok) {
    http_response_code(500);
}
echo $ok ? '{"ok":true}' : '{"ok":false}';
