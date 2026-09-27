# User ID Mapping Fix - Technical Documentation

## Overview

This document describes the fix for the user ID mapping issue that was causing foreign key constraint violations in the game sessions API.

## The Problem

### Symptoms
- `/api/games/sessions` endpoint returning 500 errors
- Error message: `insert or update on table "game_sessions" violates foreign key constraint "game_sessions_user_id_fkey"`
- Game sessions failing to save to database

### Root Cause

The JWT token from Neon Auth contains a `neon_user_id` (external identifier), but our database tables use an internal `student.id` (UUID) as the primary key. The code was incorrectly using the `neon_user_id` directly when inserting into `game_sessions.user_id`, which expects a reference to `students.id`.

```
JWT Payload:
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",  // This is neon_user_id
  "email": "user@example.com",
  ...
}

Database Schema:
students:
  - id: UUID (primary key)                        // Internal ID
  - neon_user_id: UUID (unique, references auth)  // External ID
  
game_sessions:
  - user_id: UUID (foreign key → students.id)     // Must be internal ID!
```

## The Solution

### Architecture

We implemented a two-phase authentication flow:

1. **JWT Verification** - Verify the token and extract `neon_user_id`
2. **User Resolution** - Look up the internal `student.id` from the `students` table

### Implementation

#### 1. Updated Authentication Middleware

`src/middleware/require-auth.ts`:
```typescript
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  // ... JWT verification ...
  const user = await verifyAccessToken(token);  // Contains neon_user_id
  
  // NEW: Resolve to internal student ID
  const student = await getStudentByNeonUserId(user.id);
  
  if (!student) {
    return c.json({ error: "Student record not found" }, 401);
  }
  
  // Attach BOTH user (auth info) and student (DB record) to context
  c.set("user", user);
  c.set("student", student);
  
  await next();
});
```

#### 2. Updated Type Definitions

`src/types.ts`:
```typescript
export type AppEnv = {
  Variables: {
    user: AuthUser;      // Auth info (contains neon_user_id)
    student: Student;    // DB record (contains internal id)
  };
};
```

#### 3. Updated All Routes

Changed all authenticated routes to use `student.id` instead of `user.id`:

```typescript
// BEFORE (broken)
const user = c.get("user");
await createGameSession(user.id, sessionData);  // ❌ Uses neon_user_id

// AFTER (fixed)
const student = c.get("student");
await createGameSession(student.id, sessionData);  // ✅ Uses internal ID
```

Updated routes:
- `src/routes/game-sessions.ts` - All game session operations
- `src/routes/gem-hunt.ts` - Gem hunt sessions
- `src/routes/quiz.ts` - Quiz submissions and history
- `src/routes/learn.ts` - Learning progress and assessments

## Benefits

### 1. Fixes the Bug
- Foreign key constraints are now satisfied
- Game sessions save successfully
- No more 500 errors

### 2. Performance Improvement
- Eliminates redundant database lookups
- Routes previously called `getStudentByNeonUserId()` individually
- Now resolved once in middleware

### 3. Better Developer Experience
- Clear separation between auth info (`user`) and database record (`student`)
- Consistent API across all routes
- Better error messages

### 4. Improved Debugging
- Logs show the resolution flow:
  ```
  [Auth] Neon Auth user ID from token: 550e8400-...
  [Auth] Resolved to internal student ID: 660e8400-...
  ```

## Testing

### Automated Test

Run the provided test script:

```bash
export TEST_AUTH_TOKEN="your_jwt_token_here"
tsx scripts/test-user-id-resolution.ts
```

The test verifies:
1. ✅ JWT neon_user_id is correctly extracted
2. ✅ Student is looked up by neon_user_id
3. ✅ Internal student ID is used for DB operations
4. ✅ Foreign key constraint is satisfied
5. ✅ Game session is created successfully

### Manual Testing

1. Get a valid JWT token from your auth system
2. Make a POST request to create a game session:

```bash
curl -X POST http://localhost:3000/api/games/sessions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gameType": "maths-quiz",
    "score": 80,
    "maxScore": 100,
    "timeElapsed": 120,
    "startedAt": "2024-01-01T10:00:00Z",
    "completedAt": "2024-01-01T10:02:00Z",
    "gameData": {
      "totalQuestions": 10,
      "correctAnswers": 8
    }
  }'
```

Expected response:
```json
{
  "id": "...",
  "userId": "660e8400-...",  // Internal student ID
  "gameType": "maths-quiz",
  "score": 80,
  "maxScore": 100,
  "scorePercentage": 80.0,
  ...
}
```

## Edge Cases Handled

### 1. Student Not Found
If a user has a valid JWT but no student record:
```
Response: 401 Unauthorized
{
  "authenticated": false,
  "user": null,
  "error": "Student record not found"
}
```

**Resolution**: Create a student record for the user via the admin interface.

### 2. Dual Lookup Support
The `getStudentByNeonUserId()` function checks both:
- `students.neon_user_id = neonUserId` (standard case)
- `students.id = neonUserId` (fallback for edge cases)

This provides flexibility for different user creation flows.

## Database Schema

### Students Table
```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  neon_user_id UUID UNIQUE,  -- External Neon Auth ID
  invited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX students_neon_user_id_idx 
  ON students (neon_user_id) 
  WHERE neon_user_id IS NOT NULL;
```

### Game Sessions Table
```sql
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  game_type VARCHAR(50) NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  ...
);
```

## Migration Notes

### For Existing Code
If you have other endpoints that use `user.id` for database operations:

1. Check if they're affected by this issue
2. Update them to use `student.id` instead
3. Verify foreign key constraints are satisfied

### For New Code
When creating new authenticated endpoints:

1. Use `c.get("student")` for database operations
2. Use `c.get("user")` only if you need auth-specific info (email, name, etc.)
3. Always use `student.id` for foreign key references

## Common Patterns

### Creating a Record
```typescript
const student = c.get("student");
await db.query(`
  INSERT INTO my_table (user_id, data)
  VALUES ($1, $2)
`, [student.id, data]);  // Use student.id
```

### Querying Records
```typescript
const student = c.get("student");
const records = await db.query(`
  SELECT * FROM my_table
  WHERE user_id = $1
`, [student.id]);  // Use student.id
```

### Accessing Auth Info
```typescript
const user = c.get("user");
const student = c.get("student");

// Auth info (from JWT)
console.log(user.email);
console.log(user.name);

// Database record
console.log(student.id);        // Internal ID
console.log(student.neonUserId); // External ID
```

## Troubleshooting

### Error: "Student record not found"
**Cause**: User has valid JWT but no student record in database.

**Solution**: 
1. Check if student exists: `SELECT * FROM students WHERE neon_user_id = 'XXX'`
2. If not, create via admin interface or migration
3. Verify `neon_user_id` matches JWT `sub` claim

### Error: Still getting FK constraint violations
**Cause**: Some code path is still using `user.id` instead of `student.id`.

**Solution**:
1. Check server logs for the failing query
2. Locate the route/function making the query
3. Update it to use `student.id`
4. Verify fix with test script

### Error: "Cannot read property 'id' of undefined"
**Cause**: Trying to access `student` before authentication.

**Solution**: Ensure route uses `requireAuth` middleware:
```typescript
app.get("/my-route", requireAuth, async (c) => {
  const student = c.get("student");  // Now available
  ...
});
```

## Related Files

- `src/middleware/require-auth.ts` - Authentication middleware
- `src/lib/students.ts` - Student lookup functions
- `src/lib/auth.ts` - JWT verification
- `src/types.ts` - Type definitions
- `scripts/test-user-id-resolution.ts` - Test script
- `migrations/001_students.sql` - Students table schema
- `migrations/011_game_sessions.sql` - Game sessions table schema

## References

- PR: [#18 - Fix user ID mapping](https://github.com/naaman10/bft-api/pull/18)
- Commit: `d8f4da4` - Core fix
- Commit: `693fcf9` - Test script
