# Assessment System Documentation

## Overview

The assessment system allows admin users to grade student enrollments, provide feedback on individual questions, and give overall assessment feedback. It supports both assessments (for content with `requiresAssessment: true`) and general feedback (for all enrollments).

## Database Schema

### Tables

#### `assessments`
Main assessment record tracking the grading process.

- `id` - UUID primary key
- `enrollment_id` - Foreign key to enrollments (UNIQUE)
- `assessed_by` - UUID of the admin user performing the assessment
- `status` - Assessment status: `in_progress` or `completed`
- `started_at` - When assessment was created
- `completed_at` - When assessment was completed (nullable)
- `created_at`, `updated_at` - Standard timestamps

#### `assessment_question_grades`
Points/grades awarded for individual questions.

- `id` - UUID primary key
- `assessment_id` - Foreign key to assessments
- `question_id` - Contentful question entry ID
- `points_earned` - Points awarded (0 or positive integer)
- `points_available` - Maximum points for the question (positive integer)
- UNIQUE constraint on `(assessment_id, question_id)`
- CHECK constraint: `points_earned <= points_available`

#### `assessment_question_feedback`
Feedback for individual questions.

- `id` - UUID primary key
- `assessment_id` - Foreign key to assessments
- `question_id` - Contentful question entry ID
- `feedback` - Text feedback
- UNIQUE constraint on `(assessment_id, question_id)`

#### `assessment_feedback`
Overall assessment feedback (not question-specific).

- `id` - UUID primary key
- `assessment_id` - Foreign key to assessments (UNIQUE)
- `feedback` - Text feedback

#### `enrollment_feedback`
General feedback for enrollments (available for all enrollments, not just assessed ones).

- `id` - UUID primary key
- `enrollment_id` - Foreign key to enrollments
- `feedback` - Text feedback
- `created_by` - UUID of the admin user who created the feedback
- `created_at`, `updated_at` - Standard timestamps

## API Endpoints

### POST `/admin/assessment/:enrollmentId`
Save or update an assessment with grades and feedback.

**Authorization:** Requires admin authentication

**Request Body:**
```json
{
  "assessedBy": "uuid",
  "questionGrades": [
    {
      "questionId": "contentful-question-id",
      "pointsEarned": 5,
      "pointsAvailable": 10
    }
  ],
  "questionFeedback": [
    {
      "questionId": "contentful-question-id",
      "feedback": "Good work, but you missed..."
    }
  ],
  "overallFeedback": "Overall, you demonstrated..."
}
```

**Validation:**
- Enrollment must exist and be in `to_assess` or `assessed` status
- Content must have `requiresAssessment: true`
- Question IDs must exist in the content's marking scheme
- Points available must match the marking scheme
- Points earned must be between 0 and points available

**Response:**
```json
{
  "assessment": {
    "id": "uuid",
    "enrollmentId": "uuid",
    "assessedBy": "uuid",
    "status": "in_progress",
    "startedAt": "2026-09-22T13:00:00.000Z",
    "completedAt": null,
    "createdAt": "2026-09-22T13:00:00.000Z",
    "updatedAt": "2026-09-22T13:00:00.000Z"
  },
  "questionGrades": [...],
  "questionFeedback": [...],
  "overallFeedback": "..."
}
```

### POST `/admin/assessment/:enrollmentId/complete`
Complete an assessment and update the enrollment status.

**Authorization:** Requires admin authentication

**Request Body:**
```json
{
  "assessedBy": "uuid"
}
```

**Validation:**
- Assessment must exist and be in `in_progress` status
- All questions in the marking scheme must have grades

**Actions:**
1. Updates assessment status to `completed`
2. Updates enrollment `progress_status` to `assessed`
3. Creates `points` records for all question grades (where points_earned > 0)

**Response:**
Same as save assessment endpoint, with `status: "completed"` and `completedAt` populated.

### GET `/admin/assessment/:enrollmentId`
Retrieve an existing assessment.

**Authorization:** Requires admin authentication

**Response:**
Same structure as save assessment response.

### POST `/admin/enrollment/:enrollmentId/feedback`
Add general feedback to an enrollment (works for all enrollments, not just assessed ones).

**Authorization:** Requires admin authentication

**Request Body:**
```json
{
  "feedback": "Keep up the good work...",
  "createdBy": "uuid"
}
```

**Response:**
```json
{
  "success": true
}
```

### GET `/admin/enrollment/:enrollmentId/feedback`
Retrieve all feedback for an enrollment.

**Authorization:** Requires admin authentication

**Response:**
```json
{
  "feedback": [
    {
      "id": "uuid",
      "enrollmentId": "uuid",
      "feedback": "Keep up the good work...",
      "createdBy": "uuid",
      "createdAt": "2026-09-22T13:00:00.000Z",
      "updatedAt": "2026-09-22T13:00:00.000Z"
    }
  ]
}
```

## Workflow

### Assessment Workflow

1. **Student completes content**
   - Enrollment moves to `to_assess` status (if content has `requiresAssessment: true`)
   
2. **Admin starts assessment**
   - Call `POST /admin/assessment/:enrollmentId` with initial grades/feedback
   - Assessment is created with `status: "in_progress"`
   
3. **Admin updates assessment** (optional, can be done multiple times)
   - Call `POST /admin/assessment/:enrollmentId` with updated grades/feedback
   - Previous grades and feedback are updated/replaced
   
4. **Admin completes assessment**
   - Call `POST /admin/assessment/:enrollmentId/complete`
   - System validates all questions are graded
   - Assessment status changes to `completed`
   - Enrollment status changes to `assessed`
   - Points are recorded in the `points` table
   
### Feedback Workflow

Feedback can be added at any time to any enrollment:

1. **Add feedback**
   - Call `POST /admin/enrollment/:enrollmentId/feedback`
   - Multiple feedback entries can be added over time
   
2. **View feedback**
   - Call `GET /admin/enrollment/:enrollmentId/feedback`
   - Returns all feedback entries in reverse chronological order

## Key Features

### Separation of Concerns

- **Assessments** are for content that requires grading (`requiresAssessment: true`)
- **Enrollment feedback** is available for all enrollments
- Assessment feedback and enrollment feedback are stored separately

### Flexible Grading

- Questions can receive partial credit (e.g., 5 out of 10 points)
- Zero points can be awarded (e.g., 0 out of 10)
- Grades can be updated before completion
- Points are only recorded when assessment is completed

### Multi-level Feedback

1. **Question-level feedback** - Specific feedback per question
2. **Overall assessment feedback** - General feedback about the entire assessment
3. **Enrollment feedback** - Standalone feedback entries that can be added any time

### Data Integrity

- Foreign key constraints ensure data consistency
- Unique constraints prevent duplicate grades/feedback
- Check constraints validate point ranges
- Transaction ensures atomic completion (assessment + enrollment + points)

## Error Handling

### Common Errors

- **404 Not Found** - Enrollment, content, or assessment doesn't exist
- **403 Forbidden** - Enrollment not ready for assessment, or content doesn't require assessment
- **400 Bad Request** - Invalid question IDs, point ranges, or missing required grades
- **409 Conflict** - Assessment already completed

### Validation

All validation happens before any data is saved, ensuring data integrity and providing clear error messages to the admin user.

## Points System Integration

When an assessment is completed:
- Points records are created in the `points` table
- Source is set to `'assessment'` (vs. `'automatic'` for auto-marked content)
- `awarded_by` is set to the admin user's UUID
- Only questions with `points_earned > 0` create points records
- Existing points records are updated (ON CONFLICT DO UPDATE)

## Future Enhancements

Potential areas for expansion:

1. **Assessment history** - Track changes to grades over time
2. **Rubrics** - Structured grading criteria per question
3. **Bulk operations** - Grade multiple enrollments at once
4. **Notifications** - Email students when assessment is completed
5. **Reports** - Analytics on assessment patterns and student performance
6. **Comments** - Discussion thread per assessment
