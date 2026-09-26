# Assessment API Update - Multiple Choice Answer Display

## Overview

The `/learn/assessment/:assessmentId` endpoint has been updated to include `questionType` and `options` fields at the top level of each question in the response. This allows the frontend to display human-readable answer text for multiple choice questions instead of just showing option IDs.

## What Changed

### API Response Structure

The `AssessmentDetailQuestion` type now includes two new top-level fields:

```typescript
export type AssessmentDetailQuestion = {
  questionId: string;
  questionText: string;
  questionType?: string;              // NEW
  options?: MultipleChoiceOption[];   // NEW
  questionContent?: {
    options?: MultipleChoiceOption[];
    type?: string;
  };
  pointsAvailable: number;
  pointsEarned: number;
  feedback: string | null;
  userAnswer: unknown;
  correctAnswer?: unknown;
};
```

### Example Response

**Before:**
```json
{
  "assessmentId": "abc123",
  "enrollmentName": "Reading Comprehension - Level 1",
  "totalPointsEarned": 85,
  "totalPointsAvailable": 100,
  "questions": [
    {
      "questionId": "q1",
      "questionText": "Why did the author include this paragraph?",
      "pointsAvailable": 5,
      "pointsEarned": 5,
      "feedback": "Excellent!",
      "userAnswer": "2"
    }
  ],
  "assessmentFeedback": "Great work!",
  "assessmentDate": "2024-01-15T14:30:00.000Z"
}
```

**After:**
```json
{
  "assessmentId": "abc123",
  "enrollmentName": "Reading Comprehension - Level 1",
  "totalPointsEarned": 85,
  "totalPointsAvailable": 100,
  "questions": [
    {
      "questionId": "q1",
      "questionText": "Why did the author include this paragraph?",
      "questionType": "questionMultipleChoice",
      "options": [
        {
          "id": "1",
          "text": "To suggest that another mystery may have happened."
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
      ],
      "pointsAvailable": 5,
      "pointsEarned": 5,
      "feedback": "Excellent!",
      "userAnswer": "2"
    }
  ],
  "assessmentFeedback": "Great work!",
  "assessmentDate": "2024-01-15T14:30:00.000Z"
}
```

## How to Use

### Frontend Example

```typescript
// Map the userAnswer ID to the actual option text
function getAnswerText(question: AssessmentQuestion): string {
  if (question.questionType === "questionMultipleChoice" && question.options) {
    const selectedOption = question.options.find(
      opt => opt.id === question.userAnswer
    );
    return selectedOption?.text || String(question.userAnswer);
  }
  
  // For non-multiple-choice questions, return the raw answer
  return String(question.userAnswer);
}

// Example usage
const answerText = getAnswerText(question);
console.log(`Student answered: ${answerText}`);
// Output: "Student answered: To show that Maya did not understand the clues."
```

### Handling Images

Some multiple choice options may include images:

```typescript
function renderOption(option: MultipleChoiceOption) {
  return (
    <div className="option">
      <p>{option.text}</p>
      {option.imageUrl && (
        <img src={option.imageUrl} alt={option.text} />
      )}
    </div>
  );
}
```

## Backward Compatibility

- **Text Questions**: Questions that are not multiple choice will not have `questionType` or `options` fields. The frontend should handle these gracefully by displaying the raw `userAnswer`.

- **Legacy Code**: The existing `questionContent` object is still included for backward compatibility. Older code that relies on `questionContent.options` will continue to work.

## Data Source

The question data (including options) is fetched from Contentful based on the question IDs stored in the assessment. The backend:

1. Retrieves the question entry from Contentful
2. Extracts the question type (e.g., "questionMultipleChoice")
3. Parses the options array from the question data
4. Includes this data in the API response

## Testing

Run the test scripts to verify the implementation:

```bash
# Test multiple choice answer matching logic
npx tsx scripts/test-multiple-choice.ts

# Test response structure
npx tsx scripts/test-assessment-response-structure.ts

# Run TypeScript type checking
npm run typecheck
```

## Migration Guide

If you're updating frontend code to use the new fields:

1. Check if `questionType === "questionMultipleChoice"`
2. If true, use the `options` array to map `userAnswer` to text
3. If false or `questionType` is undefined, display `userAnswer` as-is

```typescript
// Before (showing just the ID)
<p>Your answer: {question.userAnswer}</p>

// After (showing the text)
<p>Your answer: {getAnswerText(question)}</p>
```

## Related Files

- `src/lib/assessments.ts` - Contains the updated types and API logic
- `src/routes/learn.ts` - The endpoint that serves the assessment details
- `scripts/test-multiple-choice.ts` - Test script for multiple choice logic
- `scripts/test-assessment-response-structure.ts` - Test script for response structure

## Questions?

If you have questions or need help implementing this in the frontend, refer to:
- `docs/multiple-choice-json-format.md` - Detailed format documentation
- `docs/frontend-multiple-choice-helpers.md` - Helper functions and React components
