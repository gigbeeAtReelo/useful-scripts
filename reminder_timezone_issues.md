# QR Code Reminder Flow Findings

## Scope

This document explains the QR reminder pipeline for:

- `src/services/cronReminders/jobs/reminders/qrcode.js`
- `src/services/qrcode/index.js`
- `src/services/qrcode/main.js`
- `src/services/campaignmain.service.js`

It also applies the current code to these sample records:

- `qr_code_setting._id = 69d3828ecbdc9c3754a2e457`
- `qr_code_scan._id = 69e358993667cf9fe706a904`

Timezone considered: `Asia/Kuala_Lumpur`

## High-Level Flow

1. A timezone-based cron reminder job is scheduled for active country timezones.
2. For `Asia/Kuala_Lumpur`, the reminders worker finds users in that timezone.
3. It resolves all active store IDs and group IDs owned by those users.
4. The QR reminder finder scans `qr_code_scans` and selects `qr_code_id`s where:
   - `entity_id` belongs to those stores/groups
   - `last_redemption_at` does not exist
   - `reminder_at` or `expires_at` falls inside that timezone day window
5. Each matching `qr_code_id` is queued as a `qrcode` job.
6. `campaignmain.service.js` routes that job to `src/services/qrcode/main.js`.
7. `qrcode/main.js`:
   - loads the active `qr_code_setting`
   - fetches templates
   - checks credits
   - fetches audience again from `qr_code_scans`
   - writes `MessageLogs`
   - sends SQS messages

## Relevant Code Paths

- Cron seed: `src/services/cronReminders/seed.js`
- Reminders runner: `src/services/cronReminders/main.js`
- Reminder dispatcher: `src/services/cronReminders/jobs/reminder.js`
- QR reminder selector: `src/services/cronReminders/jobs/reminders/qrcode.js`
- QR audience query: `src/services/qrcode/index.js`
- QR message preparation and sending: `src/services/qrcode/main.js`
- Executor mapping: `src/services/campaignmain.service.js`

## What Makes a QR Scan Eligible

The audience query in `src/services/qrcode/index.js` includes a `qr_code_scan` only when:

- `qr_code_id` matches the current QR code
- `last_redemption_at` does not exist
- either:
  - `reminder_at` is between `startDay` and `endDay`
  - or `expires_at` is between `startDay` and `endDay`

After that, the code sets:

- `reminder_type = "reminder"` if `reminder_date == todayDate`
- otherwise `reminder_type = "expiry"`

## Channel Rules

The QR setting has:

```json
"reminder": {
  "channels": [
    { "name": "sms", "status": false },
    { "name": "whatsapp", "status": true }
  ],
  "period": "days",
  "duration": 3
}
```

Important behavior:

- `sms` will not be processed because `channel.status` is `false`
- `whatsapp` can be processed if credits and templates exist
- `email` is not part of this QR setting

The code also skips a user if:

- phone is missing for `sms` or `whatsapp`
- email is missing for `email`
- `invalid_channels` contains that channel
- `is_blocked = true`

## Sample Record Timeline

### QR Code Setting

- `qr_code_setting._id = 69d3828ecbdc9c3754a2e457`
- `status = "active"`
- `entity_type = "Group"`
- `entity_id = 67374aa75d1c2d7300ccc1f5`
- reminder config:
  - `duration = 3 days`
  - `expires_in = 5 days`
  - channels: WhatsApp active, SMS inactive

### QR Code Scan

- `qr_code_scan._id = 69e358993667cf9fe706a904`
- `qr_code_id = 69d3828ecbdc9c3754a2e457`
- `entity_id = 67374aa75d1c2d7300ccc1f5`
- `entity_type = "Group"`
- `customer_id = 69e355f1d6c9449ffa9722c3`
- `last_redemption_at` is absent
- `reminder_at = 2026-04-20T18:29:59.999Z`
- `expires_at = 2026-04-23T18:29:59.999Z`

### Malaysia Time Conversion

`Asia/Kuala_Lumpur` is UTC+8.

- `reminder_at = 2026-04-21 02:29:59.999 MYT`
- `expires_at = 2026-04-24 02:29:59.999 MYT`

## Intended Business Behavior

If the code handled Malaysia-local dates correctly, this scan should behave like:

- reminder communication on `2026-04-21` MYT
- expiry communication on `2026-04-24` MYT

Because:

- reminder is 3 days before expiry
- expiry occurs on Apr 24 in Malaysia time
- the scan is still eligible because `last_redemption_at` is missing

## Actual Current Behavior

The current implementation has timezone issues that can trigger early and duplicate communication.

### Bug 1: `endDay` Is Built Incorrectly

In both:

- `src/services/cronReminders/jobs/reminders/qrcode.js`
- `src/services/qrcode/index.js`

the code does:

```js
let endDay = new Date(
  moment.tz(timezone).endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSS\\Z')
)
```

For `Asia/Kuala_Lumpur`, this formats a local end-of-day time with a literal `Z`, which is then parsed as UTC.

Effect:

- `startDay` becomes local midnight, correctly represented as `2026-04-19T16:00:00.000Z` for Apr 20 MYT
- `endDay` becomes `2026-04-20T23:59:59.999Z`
- this is actually `2026-04-21 07:59:59.999 MYT`

So each day window is 8 hours too long.

### Bug 2: `reminder_date` and `expiry_date` Use UTC Calendar Dates

In `src/services/qrcode/index.js`, the code computes:

```js
$dateToString: {
  format: '%Y-%m-%d',
  date: '$reminder_at',
}
```

and similarly for `expires_at`, without passing `timezone`.

But `todayDate` is built with:

```js
moment.tz(timezone).startOf('day').format('YYYY-MM-DD')
```

Effect:

- `reminder_date` and `expiry_date` are interpreted using UTC date boundaries
- `todayDate` is interpreted using Malaysia-local date boundaries

So the code mixes UTC and local calendars when deciding whether a record is `"reminder"` or `"expiry"`.

## What Happens to This Exact Scan

### Malaysia run for `2026-04-20`

Effective query window from current code:

- `startDay = 2026-04-19T16:00:00.000Z`
- `endDay = 2026-04-20T23:59:59.999Z`

Your `reminder_at = 2026-04-20T18:29:59.999Z` matches this window.

Then classification happens:

- `reminder_date` becomes `2026-04-20` because it is derived in UTC
- `todayDate` for the Malaysia run is `2026-04-20`

Result:

- this scan is treated as `"reminder"`
- reminder communication can go on `2026-04-20` MYT

This is one local day earlier than intended.

### Malaysia run for `2026-04-21`

Effective query window from current code:

- `startDay = 2026-04-20T16:00:00.000Z`
- `endDay = 2026-04-21T23:59:59.999Z`

The same `reminder_at = 2026-04-20T18:29:59.999Z` still matches because of the oversized window.

Classification:

- `reminder_date` is still `2026-04-20`
- `todayDate` is now `2026-04-21`

Result:

- this scan is treated as `"expiry"`
- expiry communication can go on `2026-04-21` MYT

This is much earlier than intended.

### Malaysia run for `2026-04-23`

Effective query window from current code:

- `startDay = 2026-04-22T16:00:00.000Z`
- `endDay = 2026-04-23T23:59:59.999Z`

Your `expires_at = 2026-04-23T18:29:59.999Z` matches.

Result:

- this scan is treated as `"expiry"`
- expiry communication can go on `2026-04-23` MYT

This is one local day earlier than intended.

### Malaysia run for `2026-04-24`

Effective query window from current code:

- `startDay = 2026-04-23T16:00:00.000Z`
- `endDay = 2026-04-24T23:59:59.999Z`

The same `expires_at = 2026-04-23T18:29:59.999Z` still matches because of the oversized window.

Result:

- this scan is treated as `"expiry"`
- expiry communication can go on `2026-04-24` MYT

This matches the intended local expiry day, but it may be a duplicate of the previous day.

## Summary for This Record

Intended behavior:

- reminder on `2026-04-21` MYT
- expiry on `2026-04-24` MYT

Likely actual behavior with current code:

- reminder may go on `2026-04-20` MYT
- expiry may go on `2026-04-21` MYT
- expiry may go on `2026-04-23` MYT
- expiry may go on `2026-04-24` MYT

## Important Notes

- `customer_id` is used to populate customer contact details, evaluate blocked/invalid channels, and generate the short link. It does not itself decide reminder vs expiry.
- The reminder flow does not re-check `qr_code_setting.audience = "new"` or `qr_code_scan.customer_segment = "potential"` when sending reminders.
- Once a `qr_code_scan` row exists, reminder sending mainly depends on:
  - `last_redemption_at`
  - `reminder_at`
  - `expires_at`
  - channel availability
  - customer contact availability
  - blocked / invalid channel flags

## Suggested Fix Areas

1. Build `endDay` using actual timezone-aware Date conversion, not a formatted string with literal `Z`.
2. Pass `timezone` explicitly in Mongo `$dateToString` for `reminder_date` and `expiry_date`.
3. Consider deduplication so the same scan cannot receive repeated expiry communication across overlapping windows.
