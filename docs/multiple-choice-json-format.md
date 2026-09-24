# Multiple Choice Questions with JSON Array Options - Implementation Guide

## Overview

This document outlines how the new multiple choice question format with JSON array options will be handled in the BFT Learn API. The new format is similar to the existing `questionMultipleChoice` type but uses a structured JSON array for options.

## Question Format

### Option Structure

```json
[
  {
    "id": "1",
    "text": "To suggest that another mystery may have happened.",
    "imageUrl": "https://example.com/image1.jpg"  // optional
  },
  {
    "id": "2",
    "text": "To show that Maya did not understand the clues."
  },
  {
    "id": "3",
    "text": "To prove that Oliver was lying."
  },
  {
    "id": "4",
    "text": "To explain why the library clock stopped."
  }
]
```

### Contentful Schema

In Contentful, the `questionMultipleChoice` content type should have:

- **options** (JSON field): Array of option objects as shown above
- **answer** (Short text field): The `id` of the correct option (e.g., "1", "2", "3", "4")
- **points** (Integer field): Points awarded for correct answer
- **text/question** (Text field): The question text

## Data Flow

### 1. Student Receives Question Content

**API → Frontend**

When a student loads content to answer questions:

```typescript
GET /learn/content/:contentId

// Response includes full question content with options
{
  content: {
    entryId: "...",
    name: "...",
    fields: {
      sections: [{
        fields: {
          questions: [{
            contentType: "questionMultipleChoice",
            fields: {
              text: "Why did the author include this paragraph?",
              options: [                     // ✓ OPTIONS ARE PROVIDED
                {
                  "id": "1",
                  "text": "To suggest...",
                  "imageUrl": "..."          // Optional
                },
                {
                  "id": "2", 
                  "text": "To show..."
                }
              ],
              points: 5
              // Note: "answer" field is removed by redactAssessmentAnswers()
            }
          }]
        }
      }]
    }
  },
  progressStatus: "in_progress",
  progress: {...}
}
```

**Key Points:**
- ✅ Options array is included in the response
- ✅ Option text and images are provided
- ✅ Correct answer field is redacted (removed)
- ✅ `redactAssessmentAnswers()` only removes the `answer` field, keeps `options`

### 2. Student Submits Answer

**Frontend → API**

When a student selects an answer, the frontend submits:

```typescript
PATCH /learn/content/:contentId/progress

{
  "items": {
    "questionId123": {
      "status": "completed",
      "answer": "2"  // The ID of the selected option
    }
  }
}
```

**Storage Format**

The answer is stored in the `enrollments.progress` JSONB column:

```json
{
  "version": 1,
  "items": {
    "questionId123": {
      "status": "completed",
      "answer": "2",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "completedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Key Points:**
- ✅ Student answer = option `id` (string: "1", "2", "3", etc.)
- ✅ No changes needed to `progress.ts` schema
- ✅ Existing validation works as-is

### 3. Automatic Scoring (Non-Assessment Content)

For content that doesn't require manual assessment:

**Marking Logic (`points.ts`)**

```typescript
// Existing answersMatch() function already handles this correctly
function answersMatch(actual: unknown, expected: unknown): boolean {
  // "2" (student answer) === "2" (correct answer)
  const normalizedActual = normalizedPrimitive(actual);
  const normalizedExpected = normalizedPrimitive(expected);
  
  if (typeof normalizedExpected === "string") {
    return String(normalizedActual).trim().toLowerCase() === normalizedExpected;
  }
  
  return normalizedActual === normalizedExpected;
}
```

**Result:**
- ✅ Student answer "2" matches correct answer "2" → Points awarded
- ✅ No code changes needed in `points.ts`

### 4. Admin Review/Grading (Assessment Content)

**Endpoint:** `POST /admin/review/:enrollmentId`

**Current Response Structure:**

```typescript
{
  enrollment: {...},
  student: {...},
  content: {...},
  questions: [
    {
      questionId: "questionId123",
      questionContent: {
        text: "Why did the author include...",
        options: [
          { id: "1", text: "To suggest...", imageUrl?: "..." },
          { id: "2", text: "To show...", imageUrl?: "..." },
          { id: "3", text: "To prove...", imageUrl?: "..." },
          { id: "4", text: "To explain...", imageUrl?: "..." }
        ],
        points: 5
      },
      studentAnswer: "2",        // Raw stored value
      correctAnswer: "3",        // Raw stored value
      points: 5,
      status: "completed"
    }
  ]
}
```

**Frontend Display Logic:**

The frontend needs to:

1. **Parse the options array** from `questionContent.options`
2. **Map the IDs to full option objects**:
   - Student selected: Find option with `id === studentAnswer`
   - Correct answer: Find option with `id === correctAnswer`
3. **Display both with formatting**:
   - Show option text
   - Show option images if present
   - Highlight correct/incorrect visually

```typescript
// Frontend helper function
function getOptionById(options: Option[], id: string): Option | null {
  return options.find(opt => opt.id === id) || null;
}

// Example usage in React component
const selectedOption = getOptionById(question.questionContent.options, question.studentAnswer);
const correctOption = getOptionById(question.questionContent.options, question.correctAnswer);

// Display
<div className="answer-review">
  <div className="student-answer">
    <h4>Student Selected:</h4>
    <p>{selectedOption?.text}</p>
    {selectedOption?.imageUrl && <img src={selectedOption.imageUrl} />}
  </div>
  
  <div className="correct-answer">
    <h4>Correct Answer:</h4>
    <p>{correctOption?.text}</p>
    {correctOption?.imageUrl && <img src={correctOption.imageUrl} />}
  </div>
</div>
```

**API Changes Needed:** ✅ None - Current structure already provides all necessary data

### 5. Saving Assessment Grades

**Endpoint:** `POST /admin/assessment/:enrollmentId`

```typescript
{
  assessedBy: "adminUserId",
  questionGrades: [
    {
      questionId: "questionId123",
      pointsEarned: 5,        // Admin awards points
      pointsAvailable: 5
    }
  ],
  questionFeedback: [
    {
      questionId: "questionId123",
      feedback: "Good understanding of the text!"
    }
  ]
}
```

**Result:**
- ✅ No changes needed
- ✅ Admin grades based on comparing student answer vs correct answer
- ✅ Grading logic remains the same regardless of answer format

### 6. Student Viewing Completed Assessment

**Endpoint:** `GET /learn/assessment/:assessmentId`

**Response Structure:**

```typescript
{
  assessmentId: "...",
  enrollmentName: "Reading Comprehension - Level 1",
  totalPointsEarned: 85,
  totalPointsAvailable: 100,
  assessmentFeedback: "Great work overall!",
  assessmentDate: "2024-01-15T14:30:00.000Z",
  questions: [
    {
      questionId: "questionId123",
      questionText: "Why did the author include...",
      pointsAvailable: 5,
      pointsEarned: 5,
      feedback: "Excellent!",
      userAnswer: "3"       // The option ID the student selected
    }
  ]
}
```

**Frontend Display Requirements:**

To show the full answer (not just the ID), the frontend needs:

1. **Fetch the question content** separately to get the options array
2. **Or** modify the API to include question options in the response

**Recommended API Enhancement:**

```typescript
// In getAssessmentDetailById(), include questionContent
questions: [
  {
    questionId: "questionId123",
    questionText: "Why did the author include...",
    questionContent: {          // NEW: Include full question data
      options: [...],
      type: "questionMultipleChoice"
    },
    pointsAvailable: 5,
    pointsEarned: 5,
    feedback: "Excellent!",
    userAnswer: "3",
    correctAnswer: "3"          // NEW: Include correct answer
  }
]
```

This allows the frontend to display:
- The full text of the answer the student selected
- The full text of the correct answer (if needed)
- Any images associated with options

## Implementation Recommendations

### ✅ No Changes Required

1. **Data storage** - Current JSONB progress structure works perfectly
2. **Answer validation** - `answersMatch()` already handles string comparison
3. **Admin grading flow** - Existing endpoints work as-is
4. **Grade storage** - Assessment tables don't need changes

### ⚠️ Enhancements Recommended

#### 1. Update `getAssessmentDetailById()` in `assessments.ts`

Add question options to the response for completed assessments:

```typescript
export type AssessmentDetailQuestion = {
  questionId: string;
  questionText: string;
  questionContent?: {           // NEW
    options?: Array<{
      id: string;
      text: string;
      imageUrl?: string;
    }>;
    type?: string;
  };
  pointsAvailable: number;
  pointsEarned: number;
  feedback: string | null;
  userAnswer: unknown;
  correctAnswer?: unknown;      // NEW
};
```

Implementation in `assessments.ts` (around line 810):

```typescript
// When extracting question text, also extract options
const extractQuestionData = (value: unknown, collected: Map<string, QuestionData>, seen = new WeakSet<object>()): void => {
  // ... existing traversal logic ...
  
  if (contentType === "question" || contentType === "questionMultipleChoice") {
    const questionData = {
      text: fields.text || fields.question || fields.questionText,
      type: contentType,
      options: contentType === "questionMultipleChoice" ? fields.options : undefined,
      correctAnswer: fields.answer
    };
    
    if (questionData.text && typeof questionData.text === "string") {
      collected.set(sys.id, questionData);
    }
  }
};

// Then in the return statement
const questions: AssessmentDetailQuestion[] = gradeRows.map((grade) => {
  const questionId = String(grade.question_id);
  const progressItem = progressItems[questionId];
  const questionData = questionDataMap.get(questionId);
  
  return {
    questionId,
    questionText: questionData?.text ?? questionId,
    questionContent: questionData ? {
      options: questionData.options,
      type: questionData.type
    } : undefined,
    pointsAvailable: Number(grade.points_available),
    pointsEarned: Number(grade.points_earned),
    feedback: feedbackMap.get(questionId) ?? null,
    userAnswer: progressItem?.answer ?? null,
    correctAnswer: questionData?.correctAnswer
  };
});
```

#### 2. Frontend Documentation

Update frontend integration guide (`docs/assessment-frontend-guide.md`) with:

1. **How to handle multiple choice display** in admin review
2. **Helper functions** for mapping option IDs to option objects
3. **UI components** for displaying options with images
4. **Student-facing** completed assessment display

Example code:

```typescript
// Helper function
function renderMultipleChoiceAnswer(
  options: Array<{id: string, text: string, imageUrl?: string}>,
  answerId: string,
  isCorrect: boolean
) {
  const option = options.find(opt => opt.id === answerId);
  if (!option) return <span>No answer selected</span>;
  
  return (
    <div className={`option ${isCorrect ? 'correct' : 'incorrect'}`}>
      <p>{option.text}</p>
      {option.imageUrl && (
        <img src={option.imageUrl} alt="Option illustration" />
      )}
    </div>
  );
}
```

#### 3. Add Type Definitions

Create a shared types file for multiple choice options:

```typescript
// src/types/questions.ts
export type MultipleChoiceOption = {
  id: string;
  text: string;
  imageUrl?: string;
};

export type MultipleChoiceQuestion = {
  questionId: string;
  text: string;
  options: MultipleChoiceOption[];
  answer: string;  // The correct option ID
  points: number;
};
```

## Testing Checklist

### Unit Tests

- [x] `answersMatch()` correctly compares option IDs (already works)
- [ ] Frontend option mapping functions
- [ ] Answer display components with/without images

### Integration Tests

- [ ] Student submits multiple choice answer → progress saved correctly
- [ ] Auto-scored multiple choice → correct points awarded
- [ ] Admin reviews multiple choice → sees full option text
- [ ] Admin grades multiple choice → grades saved correctly
- [ ] Student views completed assessment → sees full answer text
- [ ] Multiple choice with images → images display correctly

### Edge Cases

- [ ] Student submits invalid option ID → validation error
- [ ] Options array is empty → error handling
- [ ] Option has no text → fallback display
- [ ] Option has malformed imageUrl → graceful fallback
- [ ] Correct answer ID doesn't exist in options → error handling

## Database Queries

No database schema changes required. All data fits into existing structure:

```sql
-- Student answer storage (existing)
SELECT progress FROM enrollments WHERE id = :enrollmentId;
-- Returns: {"version": 1, "items": {"q123": {"answer": "2", ...}}}

-- Assessment grades (existing)
SELECT * FROM assessment_question_grades WHERE assessment_id = :assessmentId;
-- Returns: questionId, pointsEarned, pointsAvailable

-- No new tables or columns needed
```

## API Endpoint Summary

| Endpoint | Changes Required | Notes |
|----------|-----------------|-------|
| `GET /learn/content/:id` | ✅ None | **Already provides options** - `redactAssessmentAnswers()` keeps options, removes answer |
| `PATCH /learn/content/:id/progress` | ✅ None | Already accepts `answer: unknown` |
| `POST /admin/review/:enrollmentId` | ✅ None | Returns full question content with options |
| `POST /admin/assessment/:enrollmentId` | ✅ None | Grades work same way |
| `GET /learn/assessment/:assessmentId` | ✅ Enhanced | Now includes `questionContent` with options |
| `GET /admin/assessment/:enrollmentId` | ✅ None | Works as-is |

## Migration Path

1. **Phase 1: Contentful Setup**
   - Add new questions with JSON options format
   - Ensure `answer` field contains option ID
   - Test with a sample question

2. **Phase 2: Frontend Updates** (if needed)
   - Add option mapping helper functions
   - Update admin review UI to display full option text
   - Update student assessment view (if using enhanced API)
   - Add image display support

3. **Phase 3: Backend Enhancement** (optional but recommended)
   - Enhance `getAssessmentDetailById()` to include question options
   - Add integration tests
   - Update API documentation

4. **Phase 4: Testing**
   - Create test questions with JSON options
   - Test full flow: answer → grade → view
   - Test with and without images
   - Verify backward compatibility with old questions

## Backward Compatibility

✅ **Fully backward compatible**

- Old multiple choice questions (non-JSON format) continue to work
- New JSON format questions work alongside old format
- No breaking changes to API or database
- Frontend can detect format by checking if `questionContent.options` exists

## Summary

The new multiple choice format with JSON array options **requires minimal backend changes**:

1. **✅ Storage:** Already works - answers are stored as strings
2. **✅ Validation:** Already works - string comparison handles option IDs  
3. **✅ Grading:** Already works - admin grades the same way
4. **⚠️ Display:** Enhancement recommended - include full options in student assessment view

**Primary work is in the frontend:**
- Map option IDs to full option objects
- Display option text and images
- Handle both old and new question formats

**Recommended backend enhancement:**
- Update `getAssessmentDetailById()` to include question options and correct answer
- This eliminates need for separate frontend queries to get option text
