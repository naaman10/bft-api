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

Returns the authenticated user's details, assigned enrollments, total earned points, and points target.

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
      "contentId": "1rTsR3YCoLYlMHFGd0greW",
      "name": "Paper 1 Maths Mock Test",
      "status": "enrolled",
      "progressStatus": "not_started",
      "enrolledAt": "2026-09-01T10:00:00.000Z"
    }
  ],
  "totalPoints": 12,
  "targetPoints": 100
}
```

`enrollments` is the student's `enrolled` rows (withdrawn is omitted). `contentId` is the Contentful entry ID. `name` comes from that entry. `status`, `progressStatus`, and `enrolledAt` come from `enrollments`. If the student is not linked, the database is unset, or Contentful cannot resolve a name, the array is empty or `name` is `""`. `totalPoints` is the sum of `points.points_earned` for the linked student. It is `0` when the student is not linked, the database is unset, or they have no awards. `targetPoints` comes from `students.target_points`. It is `null` when unset, the student is not linked, or the database is unset.

Run `npm run migrate` after deploying this change so `students.target_points` exists.

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

### `GET /learn/content/:id`

Returns a published Contentful `content` entry and the authenticated student's progress for it. `:id` is the Contentful `sys.id`. The student is taken from the JWT (same as `/learn/user`).

**Request**

```
GET /learn/content/1rTsR3YCoLYlMHFGd0greW
Authorization: Bearer <neon-auth-jwt>
```

**200**

```json
{
  "content": {
    "entryId": "1rTsR3YCoLYlMHFGd0greW",
    "name": "Paper 1 Maths Mock Test",
    "type": "Lesson",
    "subject": "Maths",
    "ageGroup": "4-5",
    "stage": "Key Stage 2",
    "entryName": "Test - Maths Paper 1",
    "fields": {}
  },
  "progressStatus": "not_started",
  "progress": {
    "version": 1,
    "items": {}
  }
}
```

`progress` is stored on `enrollments.progress` (JSONB). Empty or invalid JSON becomes `{ "version": 1, "items": {} }`. Item keys are opaque IDs (a child Contentful entry ID or a stable Learn key). Each item:

```json
{
  "status": "not_started",
  "answer": "optional",
  "score": 0,
  "attempts": 1,
  "completedAt": "2026-09-05T10:00:00.000Z",
  "updatedAt": "2026-09-05T10:00:00.000Z"
}
```

An optional `currentItemId` on `progress` is the resume position. Saving progress is a later endpoint.

**401** if the JWT is missing or invalid. **403** if the student is not enrolled in that content. **404** if the entry is not a published `content` entry. **503** if Contentful or the database is not configured.

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
    "invitedAt": "2026-08-31T10:00:00.000Z",
    "targetPoints": null
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
GET /admin/content?studentId=3f1c0a8e-2b9d-4c11-9e4a-8a6b1d2c3e4f&subject=Maths&ageGroup=GCSE
X-Admin-Api-Key: <ADMIN_API_KEY>
```

Optional query params: `type`, `subject`, `ageGroup`, and `studentId`. Omit a
content filter (or pass empty) to leave that facet unfiltered. `studentId` is the
same `students.id` UUID used by `POST /admin/enroll/:studentId`.

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
  ],
  "enrollments": [
    {
      "entryId": "abc123",
      "name": "Fractions recap",
      "type": "Lesson",
      "subject": "Maths",
      "ageGroup": "GCSE",
      "status": "enrolled",
      "progressStatus": "in_progress"
    }
  ]
}
```

`enrollments` contains the student's currently assigned (`status = enrolled`)
content and its `progressStatus` (`not_started`, `in_progress`, `completed`,
`to_assess`, or `assessed`). It is not reduced by the content browsing filters.
It is empty when
`studentId` is omitted. If an assigned Contentful entry is no longer published,
its `entryId` and status remain present while its Contentful metadata is returned
as empty strings.

**400** if `studentId` is not a UUID. **401** if the admin key is missing or
wrong. **404** if the student does not exist. **503** if Contentful or the
database is not configured.

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

### `POST /admin/review/:id`

Retrieves complete assessment review data for a specific enrollment, including student answers and correct answers from Contentful. This endpoint allows admins to review completed assessments for grading and feedback purposes.

**Request**

```
POST /admin/review/9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21
X-Admin-Api-Key: <ADMIN_API_KEY>
Content-Type: application/json
```

```json
{
  "adminUserId": "admin-user-uuid"
}
```

`:id` is the enrollment UUID (not the student ID or content ID). `adminUserId` is required for audit trail purposes.

**200**

```json
{
  "enrollment": {
    "id": "9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21",
    "studentId": "3f1c0a8e-2b9d-4c11-9e4a-8a6b1d2c3e4f",
    "contentId": "1rTsR3YCoLYlMHFGd0greW",
    "status": "enrolled",
    "progressStatus": "to_assess",
    "enrolledAt": "2026-09-01T10:00:00.000Z",
    "startedAt": "2026-09-01T10:05:00.000Z",
    "completedAt": "2026-09-01T11:30:00.000Z",
    "lastActivityAt": "2026-09-01T11:30:00.000Z"
  },
  "student": {
    "id": "3f1c0a8e-2b9d-4c11-9e4a-8a6b1d2c3e4f",
    "name": "Jane Student",
    "email": "jane.student@example.com"
  },
  "content": {
    "entryId": "1rTsR3YCoLYlMHFGd0greW",
    "name": "Paper 1 Maths Mock Test",
    "type": "Assessment",
    "subject": "Maths",
    "ageGroup": "GCSE",
    "stage": "Key Stage 4",
    "requiresAssessment": true
  },
  "sections": [],
  "questions": [
    {
      "questionId": "question-entry-id-1",
      "questionContent": {
        "question": "What is 2 + 2?",
        "points": 2
      },
      "studentAnswer": "4",
      "correctAnswer": "4",
      "points": 2,
      "status": "completed",
      "updatedAt": "2026-09-01T11:20:00.000Z",
      "completedAt": "2026-09-01T11:20:00.000Z"
    },
    {
      "questionId": "question-entry-id-2",
      "questionContent": {
        "question": "Solve for x: 3x + 5 = 14",
        "points": 3
      },
      "studentAnswer": "3",
      "correctAnswer": "3",
      "points": 3,
      "status": "completed",
      "updatedAt": "2026-09-01T11:25:00.000Z",
      "completedAt": "2026-09-01T11:25:00.000Z"
    }
  ]
}
```

The response includes:

- **enrollment**: Full enrollment record with all timestamps and status
- **student**: Student's name and email for display
- **content**: Contentful metadata for the assignment
- **sections**: Complete Contentful sections array (includes reference materials and nested content)
- **questions**: Array of all questions with both student answers and correct answers

For each question:
- `questionContent` contains the full Contentful question fields
- `studentAnswer` is the student's submitted answer (may be string, number, array, or object; `undefined` if not answered)
- `correctAnswer` is the authoritative answer from Contentful (admin-only, never exposed to students)
- `points` is the maximum points available for the question
- `status` shows completion state (`not_started`, `in_progress`, or `completed`)
- `updatedAt` and `completedAt` track when the student worked on the question

Questions are recursively extracted from the Contentful content structure. Only questions with correct answers and positive point values are included. Questions the student hasn't answered show `undefined` for `studentAnswer`.

**400** if the enrollment ID is not a valid UUID or the request body is invalid. **401** if the admin key is missing or wrong. **404** if the enrollment or content entry does not exist. **503** if Contentful or the database is not configured.

**Security note**: This endpoint exposes correct answers and is restricted to admin use only. Student-facing endpoints continue to use answer-redacted content.

### Assessment System

The assessment system allows admin users to grade student enrollments that require manual assessment (`requiresAssessment: true` in Contentful). It supports grading individual questions, providing question-level and overall feedback, and completing assessments to award points.

#### `POST /admin/assessment/:enrollmentId`

Save or update an assessment with grades and feedback. Can be called multiple times before completion.

**Request**

```
POST /admin/assessment/9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21
X-Admin-Api-Key: <ADMIN_API_KEY>
Content-Type: application/json
```

```json
{
  "assessedBy": "admin-user-uuid",
  "questionGrades": [
    {
      "questionId": "question-entry-id-1",
      "pointsEarned": 2,
      "pointsAvailable": 2
    },
    {
      "questionId": "question-entry-id-2",
      "pointsEarned": 1,
      "pointsAvailable": 3
    }
  ],
  "questionFeedback": [
    {
      "questionId": "question-entry-id-2",
      "feedback": "Good effort, but you missed the final step."
    }
  ],
  "overallFeedback": "Overall, you demonstrated good understanding of the concepts."
}
```

All fields except `assessedBy` are optional. Grades and feedback can be updated by calling the endpoint again.

**200**

```json
{
  "assessment": {
    "id": "assessment-uuid",
    "enrollmentId": "9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21",
    "assessedBy": "admin-user-uuid",
    "status": "in_progress",
    "startedAt": "2026-09-22T13:00:00.000Z",
    "completedAt": null,
    "createdAt": "2026-09-22T13:00:00.000Z",
    "updatedAt": "2026-09-22T13:05:00.000Z"
  },
  "questionGrades": [...],
  "questionFeedback": [...],
  "overallFeedback": "Overall, you demonstrated good understanding of the concepts."
}
```

**400** if question IDs are invalid, points are out of range, or the request body is malformed. **403** if the enrollment is not ready for assessment (`progressStatus` must be `to_assess` or `assessed`) or the content doesn't require assessment. **404** if the enrollment or content is not found.

#### `POST /admin/assessment/:enrollmentId/complete`

Complete an assessment, updating the enrollment to `assessed` status and recording points.

**Request**

```
POST /admin/assessment/9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21/complete
X-Admin-Api-Key: <ADMIN_API_KEY>
Content-Type: application/json
```

```json
{
  "assessedBy": "admin-user-uuid"
}
```

**200**

```json
{
  "assessment": {
    "id": "assessment-uuid",
    "enrollmentId": "9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21",
    "assessedBy": "admin-user-uuid",
    "status": "completed",
    "startedAt": "2026-09-22T13:00:00.000Z",
    "completedAt": "2026-09-22T13:10:00.000Z",
    "createdAt": "2026-09-22T13:00:00.000Z",
    "updatedAt": "2026-09-22T13:10:00.000Z"
  },
  "questionGrades": [...],
  "questionFeedback": [...],
  "overallFeedback": "..."
}
```

Completion performs three actions atomically:
1. Updates assessment status to `completed`
2. Updates enrollment `progressStatus` to `assessed`
3. Creates `points` records (source: `assessment`) for all graded questions

**400** if any required questions are missing grades. **404** if the assessment doesn't exist. **409** if the assessment is already completed.

#### `GET /admin/assessment/:enrollmentId`

Retrieve an existing assessment.

**Request**

```
GET /admin/assessment/9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21
X-Admin-Api-Key: <ADMIN_API_KEY>
```

**200** — Same structure as save/complete responses. **404** if no assessment exists for this enrollment.

#### `POST /admin/enrollment/:enrollmentId/feedback`

Add general feedback to **any enrollment**. This works for all enrollments regardless of:
- `requiresAssessment` flag (true or false)
- Progress status (not_started, in_progress, **completed**, to_assess, assessed)
- Whether an assessment exists or not

**Use Cases:**
- Feedback on **completed auto-marked content** (requiresAssessment: false)
- Feedback on assessed content (requiresAssessment: true)
- Encouragement during in-progress work

**Request**

```
POST /admin/enrollment/9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21/feedback
X-Admin-Api-Key: <ADMIN_API_KEY>
Content-Type: application/json
```

```json
{
  "feedback": "Keep up the good work! Your progress is excellent.",
  "createdBy": "admin-user-uuid"
}
```

**201**

```json
{
  "success": true
}
```

Multiple feedback entries can be added over time. **404** if the enrollment doesn't exist.

**Example: Feedback on completed auto-marked work:**
```bash
# Student completed auto-marked quiz (requiresAssessment: false)
# Enrollment status is 'completed' (not 'to_assess' or 'assessed')
# Admin can still add feedback:

POST /admin/enrollment/:enrollmentId/feedback
{
  "feedback": "Excellent work! All answers correct.",
  "createdBy": "admin-uuid"
}
# Works perfectly! Returns 201 Created
```

#### `GET /admin/enrollment/:enrollmentId/feedback`

List all feedback for an enrollment, newest first.

**Request**

```
GET /admin/enrollment/9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21/feedback
X-Admin-Api-Key: <ADMIN_API_KEY>
```

**200**

```json
{
  "feedback": [
    {
      "id": "feedback-uuid",
      "enrollmentId": "9c2e1b44-0a1f-4d3c-8e7b-2a6d5c4b3a21",
      "feedback": "Keep up the good work! Your progress is excellent.",
      "createdBy": "admin-user-uuid",
      "createdAt": "2026-09-22T14:00:00.000Z",
      "updatedAt": "2026-09-22T14:00:00.000Z"
    }
  ]
}
```

Run `npm run migrate` after deploying to create the assessment tables. See [docs/assessment-system.md](docs/assessment-system.md) for detailed documentation.

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
  lib/progress.ts        Enrollment progress JSON schema
  lib/content.ts         Contentful content listing and filters
  lib/db.ts              Neon Database client
  lib/contentful.ts      Contentful Delivery API client
  lib/resend.ts          Resend client
  middleware/            Auth (JWT) and admin API key
  routes/                HTTP routes
  app.ts                 Hono app, CORS, errors
  index.ts               Node server (binds 0.0.0.0 for Render)
```

`DATABASE_URL` is required for `/admin/user/create`, `/admin/enroll/:studentId`, and `/learn/content/:id`. `/learn/user` enrollments, `totalPoints`, and `targetPoints` also need `DATABASE_URL` (and Contentful for names); without them the session still returns **200** with `enrollments: []`, `totalPoints: 0`, and `targetPoints: null`. Contentful (`CONTENTFUL_SPACE_ID`, `CONTENTFUL_ACCESS_TOKEN`) is required for `/admin/content`, enroll, and `/learn/content/:id`. Admin create-user also needs `ADMIN_API_KEY`, Neon management vars, `LEARN_APP_URL`, and Resend vars.

## Deploy on Render

Create a **Web Service** from this repo, or use `render.yaml`.

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check | `/health` |

Render injects `PORT`. Set `FRONTEND_URL` to the live Learn (and admin) origins, comma-separated. After deploy, point the Neon Auth webhook at `https://<your-service>.onrender.com/webhooks/neon-auth`. Copy the remaining secrets from `.env.example`.


### PATCH /learn/content/:id/progress

Send the same Bearer JWT as `/learn/user`; identity comes from the token.
Requires an enrolled student. No admin key or client user ID is accepted.

```json
{
  "currentItemId": "question-entry-id",
  "items": {
    "question-entry-id": { "answer": "My answer", "status": "completed" }
  }
}
```

Both fields are optional, but at least one change is required. Item IDs are stable
question or section IDs, matching the existing v1 progress map. Answers are JSON
values; sending an answer replaces its previous value, including objects/arrays.
Omitted answers and items are preserved. Timestamps are server-generated.
Scores, attempts, user IDs, and timestamps cannot be supplied by the client.
The default save action sets enrollment progress to `in_progress`, records first activity and latest
activity, and returns **200** `{ progressStatus, progress }`.
An item being completed does not complete the entire enrollment.

**400** invalid JSON/changes; **401** invalid JWT; **403** not enrolled;
**409** enrollment submitted/assessed or conflicting concurrent changes (retry
the latter);
**503** database not configured. No new migration is required.


To complete an enrollment, use the same authenticated PATCH endpoint:

```json
{ "action": "complete" }
```

Optional `items` and `currentItemId` may accompany `action: "complete"` to save
final changes. The API merges those changes and sets `completed_at` to server
time in one guarded update. For automatically marked content it sets
`progress_status` to `completed`; when `requiresAssessment` is true it sets
`progress_status` to `to_assess`. It also
updates activity timestamps and initializes `started_at` if unset. Enrollment
`status` stays `enrolled`; completion may allocate automatic points as described
below.
The response includes `progressStatus`, `progress`, and `completedAt` (null on
ordinary saves). Subsequent saves or completion requests return 409, preserving
all saved values. `to_assess` and `assessed` enrollments are locked in the same
way as `completed`. Omitting `action`, or using `action: "save"`, retains normal
save behaviour. An empty save request is rejected.


`GET /learn/content/:id` exposes `content.requiresAssessment` (boolean) and
`content.time` when the parent Contentful entry supplies an integer. Time is
returned unchanged, without unit conversion or starting/enforcing a timer.
Existing copies in `content.fields` are retained for compatibility.
Linked `question` and `questionMultipleChoice` entries always omit their
correct-answer `fields.answer`, including nested questions. Correct answers are
kept server-side for automatic marking.
Student answers in `progress` are preserved. Question `points` remain available
as possible marks; the GET endpoint never awards points.


Completion notifications: set `COMPLETION_NOTIFICATION_EMAIL` to Ellie's email
address, alongside `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. Publish Resend's
`notification` template with `email_subject`, `email_recipient`, `email_body`,
and `email_image`.
A successful completion action sends the pupil's name/email and assignment name,
including when the resulting status is `to_assess`. Ordinary saves and rejected
repeat completion requests do not send mail.
Completion responses include `notificationSent`; false means completion succeeded
but notification delivery failed. Failures are logged, and currently require manual
follow-up; there is no background retry worker. Resend acceptance is not proof of
inbox delivery. No email is sent during local verification.

## Points allocation

Run `npm run migrate` after deploying this change to create the `points` table.
The table stores positive awards only and relates each award to a student,
parent Contentful entry, and question. `UNIQUE (student_id, question_id)` prevents
the same question awarding points to the same pupil more than once, including
when a question is reused by another content entry.

Ordinary progress saves do not allocate points. When
`PATCH /learn/content/:id/progress` receives `action: "complete"`, the API loads
the authoritative questions from Contentful and evaluates the final saved
answers. If the parent has `requiresAssessment: true`, it creates no points
rows. Otherwise, each completed, correct question with a positive integer
`points` value creates an automatic award. Incorrect, unanswered, and
in-progress questions create no row. Existing awards are left unchanged.

Text answers are trimmed and compared without case sensitivity. A numeric
Contentful answer also accepts its equivalent numeric string. The completion
response adds:

```json
{
  "assessmentRequired": false,
  "pointsAwarded": [
    {
      "questionId": "question-entry-id",
      "pointsEarned": 2,
      "pointsAvailable": 2
    }
  ]
}
```

`pointsAwarded` contains rows created by that request. It is empty when answers
are incorrect, assessment is required, or an award already exists. The client
cannot submit points, correct answers, or marking results.
`GET /learn/user` returns `totalPoints` as the sum of those earned awards for
the authenticated student, and `targetPoints` from `students.target_points`.
