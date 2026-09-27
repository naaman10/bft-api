# Game Sessions API - Implementation Documentation

## Overview
This document provides implementation details for the Game Sessions API endpoint that saves game session data from all games (Maths Quiz, Gem Hunt, Word Search, etc.).

## Database Schema

### Table: `game_sessions`

```sql
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  game_type VARCHAR(50) NOT NULL CHECK (game_type IN ('maths-quiz', 'gem-hunt', 'word-search')),
  score INTEGER NOT NULL CHECK (score >= 0),
  max_score INTEGER NOT NULL CHECK (max_score > 0),
  score_percentage DECIMAL(5,2) GENERATED ALWAYS AS ((score::decimal / max_score::decimal) * 100) STORED,
  time_elapsed_seconds INTEGER CHECK (time_elapsed_seconds >= 0),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  game_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_score CHECK (score <= max_score),
  CONSTRAINT valid_timestamps CHECK (completed_at IS NULL OR completed_at >= started_at)
);
```

### Indexes
- `idx_game_sessions_user_id` - User ID lookup
- `idx_game_sessions_game_type` - Game type filtering
- `idx_game_sessions_user_type` - Combined user + game type lookup
- `idx_game_sessions_completed_at` - Date-based sorting
- `idx_game_data` - GIN index for JSON queries

## API Endpoints

### 1. Create Game Session
**POST** `/api/games/sessions`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "gameType": "maths-quiz" | "gem-hunt" | "word-search",
  "score": number,
  "maxScore": number,
  "timeElapsed": number (optional),
  "startedAt": "ISO 8601 datetime string",
  "completedAt": "ISO 8601 datetime string (optional)",
  "gameData": {
    // Flexible JSON object for game-specific data
  }
}
```

**Example Request:**
```json
{
  "gameType": "maths-quiz",
  "score": 80,
  "maxScore": 100,
  "timeElapsed": 120,
  "startedAt": "2026-09-27T15:00:00Z",
  "completedAt": "2026-09-27T15:02:00Z",
  "gameData": {
    "totalQuestions": 10,
    "correctAnswers": 8,
    "yearGroup": "Year 6",
    "subject": "Percentages",
    "answers": [
      {
        "questionId": "uuid",
        "userAnswer": "80%",
        "correctAnswer": "80%",
        "isCorrect": true,
        "timeTaken": 12
      }
    ]
  }
}
```

**Success Response:**
- **Status:** 201 Created
- **Body:**
```json
{
  "id": "uuid",
  "userId": "uuid",
  "gameType": "maths-quiz",
  "score": 80,
  "maxScore": 100,
  "scorePercentage": 80.00,
  "timeElapsedSeconds": 120,
  "startedAt": "2026-09-27T15:00:00Z",
  "completedAt": "2026-09-27T15:02:00Z",
  "gameData": { /* ... */ },
  "createdAt": "2026-09-27T15:02:01Z",
  "updatedAt": "2026-09-27T15:02:01Z"
}
```

**Error Responses:**
- **400 Bad Request** - Validation errors
  ```json
  {
    "error": "Validation failed",
    "details": [
      {
        "path": ["score"],
        "message": "Score cannot be greater than max score"
      }
    ]
  }
  ```
- **401 Unauthorized** - Missing or invalid authentication token
- **500 Internal Server Error** - Server error

### 2. List Game Sessions
**GET** `/api/games/sessions`

**Authentication:** Required (Bearer token)

**Query Parameters:**
- `gameType` (optional) - Filter by game type: `maths-quiz`, `gem-hunt`, or `word-search`
- `limit` (optional) - Number of sessions to return (default: 20, max: 100)
- `offset` (optional) - Pagination offset (default: 0)
- `startDate` (optional) - Filter sessions completed after this date (ISO 8601)
- `endDate` (optional) - Filter sessions completed before this date (ISO 8601)

**Example Request:**
```
GET /api/games/sessions?gameType=maths-quiz&limit=20&offset=0
```

**Success Response:**
- **Status:** 200 OK
- **Body:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "userId": "uuid",
      "gameType": "maths-quiz",
      "score": 80,
      "maxScore": 100,
      "scorePercentage": 80.00,
      "timeElapsedSeconds": 120,
      "startedAt": "2026-09-27T15:00:00Z",
      "completedAt": "2026-09-27T15:02:00Z",
      "gameData": { /* ... */ },
      "createdAt": "2026-09-27T15:02:01Z",
      "updatedAt": "2026-09-27T15:02:01Z"
    }
  ]
}
```

**Error Responses:**
- **400 Bad Request** - Invalid query parameters
- **401 Unauthorized** - Missing or invalid authentication token
- **500 Internal Server Error** - Server error

### 3. Get Game Session by ID
**GET** `/api/games/sessions/:id`

**Authentication:** Required (Bearer token)

**URL Parameters:**
- `id` - Game session UUID

**Example Request:**
```
GET /api/games/sessions/550e8400-e29b-41d4-a716-446655440000
```

**Success Response:**
- **Status:** 200 OK
- **Body:** Game session object (same structure as create response)

**Error Responses:**
- **400 Bad Request** - Missing or invalid session ID
- **401 Unauthorized** - Missing or invalid authentication token
- **403 Forbidden** - User doesn't own this session
- **404 Not Found** - Session not found
- **500 Internal Server Error** - Server error

## Validation Rules

All validation is performed using Zod schemas:

1. **gameType**: Must be one of `'maths-quiz'`, `'gem-hunt'`, `'word-search'`
2. **score**: Non-negative integer, must be ≤ maxScore
3. **maxScore**: Positive integer (minimum 1)
4. **timeElapsed**: Optional non-negative integer (seconds)
5. **startedAt**: Valid ISO 8601 datetime string
6. **completedAt**: Optional valid ISO 8601 datetime string
7. **gameData**: Any valid JSON object
8. **Custom validation**: score ≤ maxScore

## Security

- All endpoints require authentication via Bearer token (JWT)
- Users can only access their own game sessions
- User ID is extracted from the JWT token, not from request body
- Authorization checks ensure users cannot view or modify other users' sessions

## Data Flow

1. **Frontend** sends POST request to `/api/games/sessions` with game data
2. **API** validates authentication token and extracts user ID
3. **API** validates request body using Zod schema
4. **Database** stores session with auto-generated UUID and score_percentage
5. **API** returns created session with 201 status

## File Structure

```
/workspace/
├── migrations/
│   └── 011_game_sessions.sql          # Database migration
├── src/
│   ├── lib/
│   │   └── game-sessions.ts           # Business logic
│   ├── routes/
│   │   └── game-sessions.ts           # API routes
│   └── app.ts                         # Updated to register routes
└── docs/
    └── CURSOR_PROMPT_GAME_SESSIONS_API.md  # This file
```

## Running the Migration

```bash
npm run migrate
```

This will apply the `011_game_sessions.sql` migration to create the `game_sessions` table.

## Testing

### Manual Testing with curl

```bash
# 1. Get authentication token (replace with your auth endpoint)
TOKEN="your_jwt_token_here"

# 2. Create a game session
curl -X POST http://localhost:3000/api/games/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gameType": "maths-quiz",
    "score": 80,
    "maxScore": 100,
    "timeElapsed": 120,
    "startedAt": "2026-09-27T15:00:00Z",
    "completedAt": "2026-09-27T15:02:00Z",
    "gameData": {
      "totalQuestions": 10,
      "correctAnswers": 8,
      "yearGroup": "Year 6",
      "subject": "Percentages"
    }
  }'

# 3. List game sessions
curl -X GET "http://localhost:3000/api/games/sessions?gameType=maths-quiz&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# 4. Get specific session (replace SESSION_ID)
curl -X GET http://localhost:3000/api/games/sessions/SESSION_ID \
  -H "Authorization: Bearer $TOKEN"
```

### Expected Behaviors

✅ Users can only see their own sessions
✅ Validation errors return 400 with details
✅ Missing authentication returns 401
✅ Accessing other users' sessions returns 403
✅ Non-existent sessions return 404
✅ Valid requests return appropriate data with correct status codes

## Integration with Frontend

The frontend Maths Quiz game should:

1. Collect game session data during gameplay
2. On completion, send POST request to `/api/games/sessions`
3. Include Bearer token in Authorization header
4. Handle success (201) and error responses appropriately
5. Optionally display historical sessions using GET endpoints

### Example Frontend Code (TypeScript/React)

```typescript
interface GameSessionData {
  gameType: 'maths-quiz' | 'gem-hunt' | 'word-search';
  score: number;
  maxScore: number;
  timeElapsed?: number;
  startedAt: string;
  completedAt?: string;
  gameData: Record<string, any>;
}

async function saveGameSession(sessionData: GameSessionData, token: string) {
  const response = await fetch('/api/games/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sessionData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save game session');
  }

  return await response.json();
}
```

## Success Criteria

✅ Database migration creates `game_sessions` table with proper constraints
✅ POST `/api/games/sessions` endpoint accepts valid game session data
✅ GET `/api/games/sessions` endpoint returns filtered sessions for authenticated user
✅ GET `/api/games/sessions/:id` endpoint returns specific session with authorization check
✅ All validation rules are enforced
✅ Users can only access their own sessions
✅ Frontend Maths Quiz successfully POSTs to endpoint and receives 201 response
✅ Follows existing codebase patterns (auth middleware, error handling, DB connection)

## Future Enhancements

Potential future improvements:

1. Add analytics endpoints (average scores, performance trends)
2. Add leaderboard functionality
3. Support for updating/patching incomplete sessions
4. Soft delete functionality
5. Data export functionality
6. Session replay functionality
