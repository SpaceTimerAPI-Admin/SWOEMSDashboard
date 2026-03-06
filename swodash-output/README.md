# Maintenance Dashboard (Netlify + Supabase)

Phone-first maintenance dashboard with:
- Employee ID + 4-digit PIN login (scanner-friendly)
- Tickets + Projects + comments (scaffolded)
- Open/Close procedures (scaffolded)
- EOD report generator (server email via Resend) (wired)
- GroupMe outbound notifications (wired)
- GroupMe inbound message logging (wired via callback URL)

## 1) Supabase setup
1. Create a Supabase project
2. In SQL Editor, run: `supabase/schema.sql`
3. (Later) Create Storage buckets:
   - `ticket-photos`
   - `project-photos`

RLS is enabled and deny-by-default. Netlify Functions use SERVICE_ROLE to bypass RLS.

## 2) Environment variables (Netlify)
Set these in Netlify site settings:

Required:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- ENROLLMENT_CODE (your secret enrollment code)
- GROUPME_BOT_ID

For GroupMe chat logging security (recommended):
- GROUPME_CALLBACK_SECRET (any random string)
- GROUPME_BOT_NAME (optional; if set, ignores bot messages)

For EOD email (Resend example):
- RESEND_API_KEY
- RESEND_FROM_EMAIL (like "Maintenance <noreply@yourdomain.com>")

## 3) Local dev
```bash
npm install
npm run dev
```

Note: For Netlify Functions locally, you can install Netlify CLI:
```bash
npm i -g netlify-cli
netlify dev
```

Then the frontend can call `/api/*` endpoints.

## 4) GroupMe callback URL
In GroupMe bot settings, set callback URL to:

`https://YOUR-NETLIFY-SITE.netlify.app/api/groupme-callback?secret=YOUR_SECRET`

(or your custom domain)

## Next build steps
- Implement Tickets CRUD + SLA sorting
- Implement Projects CRUD + conversion flow
- Implement Open/Close procedure UI + step editor
- Add photo upload (Storage) (recommended via signed upload URLs)


## Ticket API endpoints
- GET /api/tickets-list
- POST /api/tickets-create
- GET /api/tickets-get?id=...
- POST /api/tickets-comment
- POST /api/tickets-close
- POST /api/tickets-convert
