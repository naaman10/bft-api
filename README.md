# BFT API

Backend for the BFT Learn student portal. This service validates Neon Auth sessions, creates users for the admin app, sends first-login magic links through Resend, and lists Contentful learning content.

## Prerequisites

- Node.js 20.9 or later
- A [Neon](https://console.neon.tech) project with Auth enabled (same project as `bft-learn`)
- A [Resend](https://resend.com) account (for invite emails)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env file and fill in values:

   ```bash
   cp .env.example .env
   ```

3. Set `NEON_AUTH_BASE_URL` to the same Auth URL used by `bft-learn` (Neon Console → Auth → Configuration).

4. Generate an admin API key and set `ADMIN_API_KEY`:

   ```bash
   openssl rand -base64 32
   ```

5. Start the API:

   ```bash
   npm run dev
   ```

   The server listens on [http://localhost:4000](http://localhost:4000), matching `API_URL` in `bft-learn`.

## Session validation

`bft-learn` signs users in with Neon Auth, then sends the session JWT as `Authorization: Bearer …`. This API verifies that token against the Auth JWKS endpoint.

### `GET /learn/user`

Returns the authenticated user's details and their assigned enrollments.

**Request**

```
Authorization: Bearer <neon-auth-jwt>
```

**200**

```json
{
  "authenticated": true,
  "user": {
    "id": "860dc360-609f-4b7d-9e70-ec93fe6414d3",
    "email": "student@example.com",
    "name": "Student Name",
    "emailVerified": true,
    "image": null,
    "role": "authenticated"
  },
  "enrollments": [
    {
      "name": "Paper 1 Maths Mock Test",
      "status": "enrolled",
      "progressStatus": "not_started",
      "enrolledAt": "2026-09-01T10:00:00.000Z"
    }
  ]
}
```

`enrollments` is the student's `enrolled` rows (withdrawn is omitted). `name` comes from the Contentful content entry for `content_id`. `status`, `progressStatus`, and `enrolledAt` come from `enrollments`. If the student is not linked, the database is unset, or Contentful cannot resolve a name, the array is empty or `name` is `""`.

**401** — missing, expired, or invalid token

```json
{
  "authenticated": false,
  "user": null,
  "error": "Unauthorized"
}
```

From `bft-learn`:

```ts
const session = await apiFetch("/learn/user");
```

## Create a user (admin)

The admin app calls this API with a shared secret. The API creates the Neon Auth user, requests a magic link, and a Neon webhook delivers that link so Resend can send the invite.

### `POST /admin/user/create`

**Request**

```
X-Admin-Api-Key: <ADMIN_API_KEY>
Content-Type: application/json
```

```json
{
  "studentId": "3f1c0a8e-2b9d-4c11-9e4a-8a6b1d2c3e4f",
  "email": "jane.student@example.com",
  "name": "Jane Student"
}
```

`studentId` is the existing `students.id`. The student row must already exist; this endpoint does not create it. Email is the login identity; name is stored on both Neon Auth and the student row. Do not send a password.

**201**

```json
{
  "user": {
    "id": "860dc360-609f-4b7d-9e70-ec93fe6414d3",
    "email": "jane.student@example.com",
    "name": "Jane Student"
  },
  "student": {
    "id": "3f1c0a8e-2b9d-4c11-9e4a-8a6b1d2c3e4f",
    "email": "jane.student@example.com",
    "name": "Jane Student",
    "neonUserId": "860dc360-609f-4b7d-9e70-ec93fe6414d3",
    "invitedAt": "2026-08-31T10:00:00.000Z"
  },
  "inviteSent": true
}
```

If the user is created but the magic-link request fails, the response is still **201** with `inviteSent: false`. **404** if the student does not exist. **409** if that email already has a Neon Auth user, or the student is already linked. **401** if the admin key is missing or wrong.

Run migrations so `students.neon_user_id` exists:

```bash
npm run migrate
```

### Enable Resend

1. Create a [Resend](https://resend.com) account and an API key (Dashboard → API Keys). Set `RESEND_API_KEY`.
2. Set `RESEND_FROM_EMAIL`, for example `BFT Learn <noreply@yourdomain.com>`.
3. **Local / first test:** send from `BFT Learn <onboarding@resend.dev>` only to the email on your Resend account.
4. **Production:** [add and verify your domain](https://resend.com/docs/add-a-domain). Add the DNS records Resend shows (typically DKIM `TXT`, SPF `TXT`, and `MX`). After verification, use a from-address on that domain.

### Enable Neon Auth for invites

1. **Magic Link plugin** — Auth → Plugins → Magic Link on.
   - Turn **Allow new user registration** off so only admin-created users can sign in.
   - Raise **link expiration** from the default 5 minutes (60–1440 minutes is more realistic for an invite).
2. **Trusted domain** — Auth → Domains: add the Learn app origin (`http://localhost:3000` and the production Learn URL). Set `LEARN_APP_URL` to that origin.
3. **Webhook** — Auth → Configuration → Webhooks:
   - URL: `https://<this-api-host>/webhooks/neon-auth` (HTTPS hostname only; localhost is rejected).
   - Event: `send.magic_link`.
   - Timeout: 5–10 seconds so Resend can finish before Neon gives up.
4. **Neon API key** — [Console API key](https://neon.com/docs/manage/api-keys), plus `NEON_PROJECT_ID` and `NEON_BRANCH_ID`.

Local webhook testing needs a public HTTPS tunnel (ngrok or Cloudflare Tunnel) pointed at this API, then that URL in the Neon webhook config.

`FRONTEND_URL` should include the admin app origin as well as Learn, comma-separated, so CORS allows the admin browser to call this API.

### `GET /admin/content`

Lists published Contentful entries of type `content`. Filter options update with the other selected filters so dropdowns stay in sync.

**Request**

```
GET /admin/content?subject=Maths&ageGroup=GCSE
X-Admin-Api-Key: <ADMIN_API_KEY>
```

Optional query params: `type`, `subject`, `ageGroup`. Omit a param (or pass empty) to leave that facet unfiltered.

**200**

```json
{
  "filters": {
    "type": ["Homework", "Lesson"],
    "subject": ["English", "Maths"],
    "ageGroup": ["11+", "GCSE"]
  },
  "items": [
    {
      "name": "Fractions recap",
      "entryId": "abc123",
      "type": "Lesson",
      "subject": "Maths",
      "ageGroup": "GCSE"
    }
  ]
}
```

**401** if the admin key is missing or wrong. **503** if Contentful is not configured.

### `POST /admin/enroll/:studentId`

Enrolls one student in one or more Contentful content entries. Requires the admin API key. `:studentId` is a single `students.id` UUID. Multiple content IDs go in the body, not the path.

**Request**

```
POST /admin/enroll/3f1c0a8e-2b9d-4c11-9e4a-8a6b1d2c3e4f
X-Admin-Api-Key: <ADMIN_API_KEY>
Content-Type: application/json
```

```json
{
  "contentIds": ["1rTsR3YCoLYlMHFGd0greW", "anotherEntryId"]
}
```

`contentIds` are Contentful `sys.id` values (the same as `entryId` from `GET /admin/content`). Send a one-element array to enroll in a single item.

**201**

```json
{
  "enrollments": [
    {
      "id": "9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21",
      "studentId": "3f1c0a8e-2b9d-4c11-9e4a-8a6b1d2c3e4f",
      "contentId": "1rTsR3YCoLYlMHFGd0greW",
      "status": "enrolled",
      "progressStatus": "not_started",
      "progress": {},
      "enrolledAt": "2026-09-01T10:00:00.000Z",
      "startedAt": null,
      "completedAt": null,
      "lastActivityAt": null,
      "withdrawnAt": null,
      "createdAt": "2026-09-01T10:00:00.000Z",
      "updatedAt": "2026-09-01T10:00:00.000Z"
    }
  ]
}
```

Already-enrolled rows are left unchanged. A withdrawn enrollment for the same student and content is reactivated (`status` back to `enrolled`); `progress` is kept. Content metadata stays in Contentful; Neon stores `content_id` plus enrollment status and a JSON `progress` object (answers, completed sections, and so on).

**401** if the admin key is missing or wrong. **404** if the student does not exist. **400** if `studentId` is not a UUID, the body is invalid, or a content ID is not a published Contentful `content` entry. **503** if the database or Contentful is not configured.

Apply the schema before using this:

```bash
npm run migrate
```

## Project structure

```
src/
  config/env.ts          Validated environment
  emails/                Email HTML/text templates
  lib/auth.ts            Neon Auth JWT verification
  lib/neon-auth.ts       Management API create-user and magic-link trigger
  lib/neon-webhook.ts    Webhook signature verification
  lib/email.ts           Resend send helper
  lib/students.ts        Student records in Neon Database
  lib/enrollments.ts     Student–content enrollments and progress
  lib/content.ts         Contentful content listing and filters
  lib/db.ts              Neon Database client
  lib/contentful.ts      Contentful Delivery API client
  lib/resend.ts          Resend client
  middleware/            Auth (JWT) and admin API key
  routes/                HTTP routes
  app.ts                 Hono app, CORS, errors
  index.ts               Node server (binds 0.0.0.0 for Render)
```

`DATABASE_URL` is required for `/admin/user/create` and `/admin/enroll/:studentId`. `/learn/user` enrollments also need `DATABASE_URL` (and Contentful for names); without them the session still returns **200** with `enrollments: []`. Contentful (`CONTENTFUL_SPACE_ID`, `CONTENTFUL_ACCESS_TOKEN`) is required for `/admin/content` and enroll. Admin create-user also needs `ADMIN_API_KEY`, Neon management vars, `LEARN_APP_URL`, and Resend vars.

## Deploy on Render

Create a **Web Service** from this repo, or use `render.yaml`.

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check | `/health` |

Render injects `PORT`. Set `FRONTEND_URL` to the live Learn (and admin) origins, comma-separated. After deploy, point the Neon Auth webhook at `https://<your-service>.onrender.com/webhooks/neon-auth`. Copy the remaining secrets from `.env.example`.
