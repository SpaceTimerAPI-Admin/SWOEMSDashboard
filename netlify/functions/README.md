Netlify Functions (server-side)
- login.ts: verify employee_id + pin, create session token
- enroll.ts: create employee with enrollment code + pin
- notify-event.ts: post key events to GroupMe
- groupme-callback.ts: ingest GroupMe group messages and store in Supabase
- send-eod.ts: generate full day recap snapshot + email it to the requester (no photos)
