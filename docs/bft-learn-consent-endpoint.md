# BFT Learn Consent Endpoint

## Overview

Public endpoint for receiving BFT Learn consent form submissions. When a submission is received, an email notification is sent to `ellie@brighterfuturestutoring.com`.

## Endpoint

**URL:** `POST /web/bft-learn-consent`

**Authentication:** None (public endpoint)

## Request

### Headers
```
Content-Type: application/json
```

### Body
```json
{
  "email": "parent@example.com",
  "consent": true
}
```

**Fields:**
- `email` (string, required): Parent's email address (must be valid email format)
- `consent` (boolean, required): Consent value (true or false)

## Response

### Success (200)
```json
{
  "ok": true,
  "message": "Consent form submission received"
}
```

### Error Responses

#### Invalid JSON (400)
```json
{
  "error": "Invalid JSON body"
}
```

#### Validation Error (400)
```json
{
  "error": "Invalid request body",
  "details": [
    {
      "path": ["email"],
      "message": "Invalid email"
    }
  ]
}
```

#### Server Error (500)
```json
{
  "error": "Failed to process consent form submission"
}
```

## Email Notification

When a submission is successfully processed, an email is sent to `ellie@brighterfuturestutoring.com` with:

- **Subject:** "BFT Learn Consent Form Submission"
- **Recipient Name:** "Ellie"
- **Body:** 
  ```
  A parent has submitted the BFT Learn consent form.
  
  Email: parent@example.com
  Consent: YES
  ```
- **Branding:** Includes BFT logo

## Testing

### Using cURL
```bash
curl -X POST http://localhost:4000/web/bft-learn-consent \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","consent":true}'
```

### Using JavaScript fetch
```javascript
const response = await fetch('http://localhost:4000/web/bft-learn-consent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'parent@example.com',
    consent: true
  })
});

const data = await response.json();
console.log(data);
```

## Environment Requirements

The following environment variables must be configured:
- `RESEND_API_KEY` - Resend API key for sending emails
- `RESEND_FROM_EMAIL` - Sender email address

The endpoint uses the "notification" Resend template which should be configured in your Resend account.
