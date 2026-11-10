# Zenith public & customer API (`/api/v1`)

For the developers of the main website. Everything here is JSON over HTTPS.

- **Base URL:** `https://<back-office-host>/api/v1`
- **Money** is always an integer in **kobo** (₦1 = 100 kobo). `priceKobo: 18500000000` = ₦185,000,000.
- **IDs** are UUIDs. Properties are addressed by `slug` in URLs.
- **Dates:** ISO 8601 in responses. Inspection dates are `YYYY-MM-DD`, times `HH:MM` (24h, Nigeria time).

## Setup (environment variables on the back office)

| Variable | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Comma-separated website origins allowed by CORS, e.g. `https://zenithassetsproperties.netlify.app` |
| `FRONTEND_URL` | Website base URL used in emailed links (`/reset-password?token=`, `/verify-email?token=`). Defaults to the first allowed origin |
| `PAYMENT_CALLBACK_URL` | Where Paystack sends the buyer after paying. Defaults to `FRONTEND_URL/payment/callback` |
| `PAYSTACK_SECRET_KEY` | Paystack secret key (also signs/validates webhooks) |
| `PUBLIC_API_KEY` | Optional shared key for your website *server* (higher analytics allowance) |

## Conventions

**Errors** always look like:
```json
{ "error": "Human readable message", "details": [{ "path": "email", "message": "Invalid email" }] }
```
| Status | Meaning |
|---|---|
| 400 | Invalid input / rule broken (see `error`, `details`) |
| 401 | Missing, expired or revoked login token |
| 404 | Not found **or not yours** (other people's records are indistinguishable from missing ones) |
| 409 | Conflict (property no longer available, amount mismatch) |
| 429 | Rate limited, slow down |
| 502 | Payment provider problem |

**CORS:** only origins in `ALLOWED_ORIGINS` get `Access-Control-Allow-Origin`. Allowed headers: `Content-Type, Authorization, X-Api-Key`.

**Auth for customer routes:** `Authorization: Bearer <token>` where the token comes from `POST /auth/login`. Tokens last 7 days and stop working after a password change/reset or if the account is blocked. Keep the token in memory or an httpOnly cookie set by your own server.

**Rate limits** (per IP unless noted): property reads 120/min, enquiries & inspections 30/min plus 10/hour for creating, analytics 120/min (6000/min with `X-Api-Key`), register 30/hour per IP and 5/hour per email, login 10 per 15 min per email, forgot-password 3/hour per email, payments initialise 20/min, reservations 10/min.

---

## Public endpoints

### `GET /properties`
Only non-draft properties. Never includes exact coordinates, agent ids or staff notes.

Query: `state, city, area, type (land|house|apartment|commercial), purpose (buy|invest|rent), minPrice, maxPrice` (**kobo**), `minLand, maxLand, minSize, maxSize` (sqm), `bedrooms, bathrooms` (minimums), `availability (available|reserved|sold), paymentPlan (true|false), q` (text search), `collection (new|featured|price_reduced|popular|limited), sort (newest|price_asc|price_desc|popular), page, pageSize (max 100)`.

```json
{ "items": [{ "id": "…", "slug": "4-bedroom-duplex-ab12c", "name": "4-Bedroom Detached Duplex", "type": "house", "purpose": "buy",
  "status": "available", "state": "Lagos", "city": "Lekki", "area": "Phase 1", "priceKobo": 18500000000, "sizeSqm": 350,
  "landSizeSqm": 600, "bedrooms": 4, "bathrooms": 5, "parking": 3, "developmentStatus": "Completed", "verified": true,
  "featured": true, "priceReduced": false, "limitedAvailability": false, "paymentPlanAvailable": true,
  "createdAt": "…", "coverUrl": "https://…signed-link (valid 1 hour)" }],
  "total": 42, "page": 1, "pageSize": 25 }
```

### `GET /properties/{slug}`
Everything on a card plus `description, features[], nearby[{category,name,distance}]`, `media[{id,kind,caption,url}]` (photo, video, floorplan, siteplan, drone, tour360), `investment` (only for investment properties; carries a `disclaimer` saying figures are estimates), `verification {verified, explanation}`, `documentation[]`, `agent {name, phone}`, `paymentPlan {available, minDepositPercent, maxMonths}`, `reservation {feeKobo, holdDays}`, `similar[]`.

`documentation` shows **status only**, never links:
```json
{ "kind": "survey_plan", "title": "Survey plan", "label": "Survey Plan", "status": "Verified / Available for review", "accessRequired": true }
```
Customers ask for sensitive documents with `POST /properties/{slug}/documents/{kind}/request-access` (below). Documents marked public include a `documentId`.

### `GET /properties/{slug}/payment-plan?deposit=30&months=12`
Calculator. `deposit` must be ≥ the property's `minDepositPercent`, `months` ≤ its `maxMonths`, otherwise 400.
```json
{ "priceKobo": 10000000000, "depositPercent": 30, "depositKobo": 3000000000, "balanceKobo": 7000000000, "months": 12, "monthlyKobo": 583333334, "note": "Estimate…" }
```

### `GET /compare?slugs=a,b,c`
2–4 properties, same card fields plus `documentation[]` (labels) and `inspectionAvailable`.

### `POST /enquiries`
```json
{ "kind": "callback", "name": "Ada Obi", "email": "ada@example.com", "phone": "0803…", "message": "Call me", "propertySlug": "…", "source": "instagram", "website": "" }
```
`kind`: `enquiry | callback | consultation | property_request | whatsapp`. Email **or** phone required. `website` is a hidden honeypot field: leave it empty in your real form (include it as a hidden input; bots fill it and are silently ignored). Every enquiry becomes a lead. → `201 { ok, enquiryId, leadId, message }`.

### `POST /inspections`
```json
{ "propertySlug": "…", "kind": "physical", "name": "Chidi Eze", "phone": "08031234567", "email": "c@example.com",
  "preferredDate": "2026-12-01", "preferredTime": "14:30", "visitors": 2, "specialRequest": "Bring a lawyer", "website": "" }
```
`kind`: `physical | virtual`. Date can't be in the past; visitors 1–20. The customer gets the confirmation by **email and SMS** (and an in-platform notification when the request carries a login token). → `201 { ok, inspectionId, status: "requested", message }`.

### `POST /analytics/events`
Single event or `{ "events": [ … up to 20 ] }`:
```json
{ "type": "property_view", "propertySlug": "…", "sessionId": "abc123", "source": "google", "meta": { "q": "lekki" } }
```
`type`: `visit, property_view, search, tour_view, doc_view, enquiry_click, payment_started, page_view`. Send `X-Api-Key` from your server for the higher allowance.

---

## Customer accounts

| Endpoint | Body | Result |
|---|---|---|
| `POST /auth/register` | `{fullName, email, phone, password, country?, isDiaspora?}` | `201 {ok, message}`. **Identical answer whether or not the email exists** (no account enumeration); the customer then signs in. A verification email is sent. Password: 12+ chars, upper, lower and a number |
| `POST /auth/login` | `{email, password}` | `{token, customer}` |
| `GET /me` · `PATCH /me` | `{fullName?, phone?, country?, isDiaspora?}` | customer profile (changing phone clears `phoneVerified`) |
| `POST /auth/change-password` | `{current, next}` | `{ok, token}`; all older tokens stop working |
| `POST /auth/forgot-password` | `{email}` | always `{ok}`; emails a 1-hour link `FRONTEND_URL/reset-password?token=…` |
| `POST /auth/reset-password` | `{token, password}` | `{ok}`. **Single use**, and signs out old sessions |
| `POST /auth/verify-email/send` (login) · `POST /auth/verify-email` | `{token}` | marks email verified (link is tied to that address) |
| `POST /auth/verify-phone/send` (login) | – | SMS code sent; returns opaque `{token}` to keep |
| `POST /auth/verify-phone` (login) | `{token, code}` | marks phone verified |

## Customer area (all need `Authorization: Bearer …`)

| Endpoint | Notes |
|---|---|
| `GET /dashboard` | counts: `transactions, activeReservations, savedProperties, unreadNotifications, documentsAvailable, upcomingInspections, totalPaidKobo, totalOutstandingKobo` |
| `GET /me/properties` | "My Properties": `{transactionId, status ("Purchase completed", "Reserved"…), property, priceKobo, paidKobo, outstandingKobo, documentation: "available"|"pending"}`. (Not `/properties`, which is the public list.) |
| `GET /transactions` · `GET /transactions/{id}` | detail includes `timeline` (six steps, each `done | current | pending | cancelled`) and `payments[]` with `receiptNumber` |
| `GET /payments` | history with `receipt {number, issuedAt}` |
| `GET /reservations` · `POST /reservations` | see below |
| `GET /inspections/mine` | my bookings (booking itself is the public `POST /inspections`) |
| `GET /notifications?page=` · `POST /notifications/read` | list with `unread`; body `{ids:[…]}` or empty = mark all read |
| `GET /favorites` · `PUT /favorites/{propertyId}` · `DELETE /favorites/{propertyId}` | saved properties |
| `GET /alerts` · `POST /alerts` · `DELETE /alerts/{id}` | `{criteria:{city?, state?, type?, minBedrooms?, maxPriceKobo?}}`, max 20. Customers are notified when a matching property goes live, when a saved property's price changes, or when it stops being available |

### Document vault
- `GET /documents`: own **approved** documents (newest version + `previousVersions[]`).
- `GET /documents/{id}/download` → `{url, expiresInSeconds: 300}`. Allowed for own documents, documents the customer was granted access to, and public documents. Otherwise 404. Every download is audit-logged.
- `POST /documents/{id}/share` → `{url, expiresInSeconds: 3600}` for **own** documents only.
- `POST /properties/{slug}/documents/{kind}/request-access` → `202 {ok, status: "pending"}`; staff approve in the back office.

---

## Reserving and paying

Amounts always come from our records. The only client-chosen amount is a partial payment, which is bounded by the rules below.

1. **Reserve:** `POST /reservations {propertySlug, acceptTerms: true}`
   - Property must be `available`. Fee = the property's `reservation.feeKobo`.
   - **Fee 0:** reservation is active at once, property becomes `reserved`; `authorizationUrl` is `null`.
   - **Fee > 0:** returns `{ reservationId, transactionId, reference, amountKobo, authorizationUrl }`. Redirect the buyer to `authorizationUrl`. The property is held for 30 minutes for this buyer while they pay; it becomes `reserved` once paid.
2. **Pay more:** `POST /payments/initialize {transactionId, kind, amountKobo, acceptTerms: true}`, returns `{reference, amountKobo, authorizationUrl}`.
   - `full` / `balance`: amount must equal the outstanding balance.
   - `deposit` (payment-plan properties): total paid must reach `minDepositPercent` of the price.
   - `installment`: only after the deposit, and not below `(price − minimum deposit) / maxMonths` unless it is the final remainder.
   - No plan on the property: only `full`.
3. **Return page:** Paystack sends the buyer back to `PAYMENT_CALLBACK_URL?reference=…`. Call `GET /payments/verify?reference=…` (logged in). It asks Paystack and settles if paid: `{status: "success" | "pending" | "failed", reference}`.
4. **Webhook (the reliable path):** configure `https://<back-office-host>/api/webhooks/paystack` in the Paystack dashboard. We verify the `x-paystack-signature` HMAC-SHA512 over the raw body, handle `charge.success`, and answer 200 for repeats. Settlement is idempotent, so webhook and return page can both run safely. If Paystack's amount differs from what we expected, the payment is **not** accepted and is flagged for staff.

On success the system issues a receipt, moves the transaction forward (`reservation_confirmed` → `payment_received` → `documentation_processing`), marks the property reserved/sold, and notifies the customer by email, SMS and in-platform.
