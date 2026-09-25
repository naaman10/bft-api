# API Response Examples - Multiple Choice Questions

This document provides complete example responses for endpoints that return multiple choice questions with JSON array options.

## 1. Admin Review Endpoint

**Endpoint:** `POST /admin/review/:enrollmentId`

**Purpose:** Admin reviews student's submitted answers to grade them

**Request:**
```http
POST /admin/review/abc123-def456-ghi789
Content-Type: application/json
X-Admin-Api-Key: your-api-key

{
  "adminUserId": "admin-uuid-123"
}
```

**Response:** `200 OK`

```json
{
  "enrollment": {
    "id": "abc123-def456-ghi789",
    "studentId": "student-uuid-456",
    "contentId": "7A8xKjpqN9vD2mL5wYzR3f",
    "status": "enrolled",
    "progressStatus": "to_assess",
    "enrolledAt": "2024-01-10T08:00:00.000Z",
    "startedAt": "2024-01-10T09:15:00.000Z",
    "completedAt": "2024-01-10T10:30:00.000Z",
    "lastActivityAt": "2024-01-10T10:30:00.000Z"
  },
  "student": {
    "id": "student-uuid-456",
    "name": "Emily Johnson",
    "email": "emily.johnson@example.com"
  },
  "content": {
    "entryId": "7A8xKjpqN9vD2mL5wYzR3f",
    "name": "Reading Comprehension - Mystery at the Library",
    "type": "assessment",
    "subject": "English",
    "ageGroup": "7-8",
    "stage": "2",
    "requiresAssessment": true
  },
  "sections": [
    {
      "entryId": "section-1",
      "contentType": "section",
      "fields": {
        "title": "Part 1: Understanding the Text"
      }
    }
  ],
  "questions": [
    {
      "questionId": "2KmP9vL3xN8qR5wY7zT1f",
      "questionContent": {
        "text": "Why did the author include the final paragraph?",
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
        "points": 5
      },
      "studentAnswer": "1",
      "correctAnswer": "1",
      "points": 5,
      "status": "completed",
      "updatedAt": "2024-01-10T10:15:00.000Z",
      "completedAt": "2024-01-10T10:15:00.000Z"
    },
    {
      "questionId": "5XvW8nM2kL9pQ4rY6zT3h",
      "questionContent": {
        "text": "Which image shows the shape of the mysterious object Maya found?",
        "options": [
          {
            "id": "1",
            "text": "A circle",
            "imageUrl": "https://images.contentful.com/space/circle-shape.jpg"
          },
          {
            "id": "2",
            "text": "A square",
            "imageUrl": "https://images.contentful.com/space/square-shape.jpg"
          },
          {
            "id": "3",
            "text": "A triangle",
            "imageUrl": "https://images.contentful.com/space/triangle-shape.jpg"
          },
          {
            "id": "4",
            "text": "A star",
            "imageUrl": "https://images.contentful.com/space/star-shape.jpg"
          }
        ],
        "points": 3
      },
      "studentAnswer": "2",
      "correctAnswer": "3",
      "points": 3,
      "status": "completed",
      "updatedAt": "2024-01-10T10:18:00.000Z",
      "completedAt": "2024-01-10T10:18:00.000Z"
    },
    {
      "questionId": "9TyU4mN7kL2pQ5rY8zW1g",
      "questionContent": {
        "text": "What was Oliver's main emotion when Maya solved the mystery?",
        "options": [
          {
            "id": "1",
            "text": "Angry"
          },
          {
            "id": "2",
            "text": "Surprised"
          },
          {
            "id": "3",
            "text": "Happy"
          },
          {
            "id": "4",
            "text": "Confused"
          }
        ],
        "points": 4
      },
      "studentAnswer": "3",
      "correctAnswer": "2",
      "points": 4,
      "status": "completed",
      "updatedAt": "2024-01-10T10:22:00.000Z",
      "completedAt": "2024-01-10T10:22:00.000Z"
    },
    {
      "questionId": "6HgF3mN8kL1pQ9rY5zT7j",
      "questionContent": {
        "text": "Write a short answer: What lesson did Maya learn from the mystery?",
        "points": 8
      },
      "studentAnswer": "Maya learned that paying attention to small details is important when solving problems.",
      "correctAnswer": null,
      "points": 8,
      "status": "completed",
      "updatedAt": "2024-01-10T10:28:00.000Z",
      "completedAt": "2024-01-10T10:28:00.000Z"
    }
  ]
}
```

### Key Points for Admin Review:

**Multiple Choice Question (Text Only):**
```json
{
  "questionId": "2KmP9vL3xN8qR5wY7zT1f",
  "questionContent": {
    "options": [
      {"id": "1", "text": "Option A"},
      {"id": "2", "text": "Option B"}
    ]
  },
  "studentAnswer": "1",    // Student selected option 1
  "correctAnswer": "1"     // Correct answer is option 1
}
```

**Multiple Choice Question (With Images):**
```json
{
  "questionId": "5XvW8nM2kL9pQ4rY6zT3h",
  "questionContent": {
    "options": [
      {
        "id": "1",
        "text": "A circle",
        "imageUrl": "https://..."  // Image to display
      }
    ]
  },
  "studentAnswer": "2",    // Student selected option 2
  "correctAnswer": "3"     // Correct answer is option 3
}
```

**Non-Multiple Choice Question:**
```json
{
  "questionId": "6HgF3mN8kL1pQ9rY5zT7j",
  "questionContent": {
    // No options array for written answers
    "text": "Write a short answer..."
  },
  "studentAnswer": "Full text response...",
  "correctAnswer": null    // Manually graded questions have no preset answer
}
```

---

## 2. Student Assessment View Endpoint

**Endpoint:** `GET /learn/assessment/:assessmentId`

**Purpose:** Student views their completed and graded assessment

**Request:**
```http
GET /learn/assessment/assess-uuid-789
Authorization: Bearer student-auth-token
```

**Response:** `200 OK`

```json
{
  "assessmentId": "assess-uuid-789",
  "enrollmentName": "Reading Comprehension - Mystery at the Library",
  "totalPointsEarned": 12,
  "totalPointsAvailable": 20,
  "assessmentFeedback": "Great work on this assessment! You showed good understanding of the main themes. Focus on paying closer attention to descriptive details for visual questions.",
  "assessmentDate": "2024-01-11T14:30:00.000Z",
  "questions": [
    {
      "questionId": "2KmP9vL3xN8qR5wY7zT1f",
      "questionText": "Why did the author include the final paragraph?",
      "questionContent": {
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
        "type": "questionMultipleChoice"
      },
      "pointsAvailable": 5,
      "pointsEarned": 5,
      "feedback": "Perfect! You correctly identified the author's purpose.",
      "userAnswer": "1",
      "correctAnswer": "1"
    },
    {
      "questionId": "5XvW8nM2kL9pQ4rY6zT3h",
      "questionText": "Which image shows the shape of the mysterious object Maya found?",
      "questionContent": {
        "options": [
          {
            "id": "1",
            "text": "A circle",
            "imageUrl": "https://images.contentful.com/space/circle-shape.jpg"
          },
          {
            "id": "2",
            "text": "A square",
            "imageUrl": "https://images.contentful.com/space/square-shape.jpg"
          },
          {
            "id": "3",
            "text": "A triangle",
            "imageUrl": "https://images.contentful.com/space/triangle-shape.jpg"
          },
          {
            "id": "4",
            "text": "A star",
            "imageUrl": "https://images.contentful.com/space/star-shape.jpg"
          }
        ],
        "type": "questionMultipleChoice"
      },
      "pointsAvailable": 3,
      "pointsEarned": 0,
      "feedback": "The text describes the object as having three points. Try re-reading that section.",
      "userAnswer": "2",
      "correctAnswer": "3"
    },
    {
      "questionId": "9TyU4mN7kL2pQ5rY8zW1g",
      "questionText": "What was Oliver's main emotion when Maya solved the mystery?",
      "questionContent": {
        "options": [
          {
            "id": "1",
            "text": "Angry"
          },
          {
            "id": "2",
            "text": "Surprised"
          },
          {
            "id": "3",
            "text": "Happy"
          },
          {
            "id": "4",
            "text": "Confused"
          }
        ],
        "type": "questionMultipleChoice"
      },
      "pointsAvailable": 4,
      "pointsEarned": 2,
      "feedback": "Oliver was surprised, not happy. The text says 'his eyes widened in disbelief.'",
      "userAnswer": "3",
      "correctAnswer": "2"
    },
    {
      "questionId": "6HgF3mN8kL1pQ9rY5zT7j",
      "questionText": "Write a short answer: What lesson did Maya learn from the mystery?",
      "questionContent": {
        "type": "question"
      },
      "pointsAvailable": 8,
      "pointsEarned": 5,
      "feedback": "Good answer! You could also mention that she learned the importance of asking questions.",
      "userAnswer": "Maya learned that paying attention to small details is important when solving problems.",
      "correctAnswer": null
    }
  ]
}
```

### Key Points for Student View:

**Correct Answer (Multiple Choice):**
```json
{
  "questionId": "...",
  "questionText": "Question text here",
  "questionContent": {
    "options": [...],  // All options provided
    "type": "questionMultipleChoice"
  },
  "userAnswer": "1",        // Student selected option 1
  "correctAnswer": "1",     // Correct is option 1
  "pointsEarned": 5,        // Full points ✓
  "pointsAvailable": 5,
  "feedback": "Perfect!"
}
```

**Incorrect Answer (Multiple Choice):**
```json
{
  "questionId": "...",
  "questionText": "Question text here",
  "questionContent": {
    "options": [...],  // All options provided
    "type": "questionMultipleChoice"
  },
  "userAnswer": "2",        // Student selected option 2
  "correctAnswer": "3",     // Correct is option 3 (different)
  "pointsEarned": 0,        // No points ✗
  "pointsAvailable": 3,
  "feedback": "Try re-reading..."
}
```

**Partial Credit (Manually Graded):**
```json
{
  "questionId": "...",
  "questionText": "Question text here",
  "questionContent": {
    "type": "question"  // Not multiple choice
  },
  "userAnswer": "Text answer...",
  "correctAnswer": null,
  "pointsEarned": 2,         // Partial credit
  "pointsAvailable": 4,
  "feedback": "Good answer! Could also mention..."
}
```

---

## 3. Frontend Display Logic

### Admin Review - Display Student Answer

```typescript
// For multiple choice questions
function displayStudentAnswer(question) {
  if (question.questionContent?.options) {
    // Find the option object
    const selectedOption = question.questionContent.options.find(
      opt => opt.id === question.studentAnswer
    );
    const correctOption = question.questionContent.options.find(
      opt => opt.id === question.correctAnswer
    );
    
    return {
      selected: selectedOption?.text || "No answer selected",
      selectedImage: selectedOption?.imageUrl,
      correct: correctOption?.text || "N/A",
      correctImage: correctOption?.imageUrl,
      isCorrect: question.studentAnswer === question.correctAnswer
    };
  }
  
  // For text/written answers
  return {
    answer: question.studentAnswer,
    isManuallyGraded: true
  };
}
```

### Student View - Display Result

```typescript
// For multiple choice questions
function displayAssessmentResult(question) {
  if (question.questionContent?.options) {
    const yourOption = question.questionContent.options.find(
      opt => opt.id === question.userAnswer
    );
    const correctOption = question.questionContent.options.find(
      opt => opt.id === question.correctAnswer
    );
    
    const isCorrect = question.userAnswer === question.correctAnswer;
    
    return {
      yourAnswer: {
        text: yourOption?.text || "Not answered",
        image: yourOption?.imageUrl,
        isCorrect
      },
      correctAnswer: {
        text: correctOption?.text,
        image: correctOption?.imageUrl
      },
      score: `${question.pointsEarned} / ${question.pointsAvailable}`,
      feedback: question.feedback
    };
  }
  
  // For text/written answers
  return {
    yourAnswer: question.userAnswer,
    score: `${question.pointsEarned} / ${question.pointsAvailable}`,
    feedback: question.feedback
  };
}
```

---

## 4. Edge Cases

### No Answer Provided

**Admin Review:**
```json
{
  "questionId": "...",
  "questionContent": {
    "options": [...]
  },
  "studentAnswer": null,     // No answer
  "correctAnswer": "2",
  "points": 5,
  "status": "not_started"
}
```

**Student View:**
```json
{
  "questionId": "...",
  "questionContent": {
    "options": [...]
  },
  "userAnswer": null,        // No answer
  "correctAnswer": "2",
  "pointsEarned": 0,
  "pointsAvailable": 5
}
```

### Invalid Option ID

If a student somehow submits an invalid option ID (not in the options array), handle gracefully:

```typescript
const selectedOption = options.find(opt => opt.id === studentAnswer);
const displayText = selectedOption?.text || `Invalid answer: ${studentAnswer}`;
```

### Options Missing (Old Format or Error)

If `questionContent.options` is undefined, fall back to displaying the raw answer:

```typescript
if (!question.questionContent?.options) {
  // Display raw answer value
  return <div>Answer: {question.studentAnswer}</div>;
}
```

---

## 5. Complete Example Request/Response Flow

### Step 1: Admin Opens Review Page

```http
POST /admin/review/abc123-def456-ghi789
X-Admin-Api-Key: your-api-key

{
  "adminUserId": "admin-uuid-123"
}
```

**Frontend receives:**
- List of all questions
- Student's answers (option IDs)
- Correct answers (option IDs)
- Full options arrays with text/images

**Frontend displays:**
- Side-by-side comparison
- Student selected: "Option 2: To show that Maya..."
- Correct answer: "Option 1: To suggest that..."

### Step 2: Admin Grades

```http
POST /admin/assessment/abc123-def456-ghi789

{
  "assessedBy": "admin-uuid-123",
  "questionGrades": [
    {
      "questionId": "2KmP9vL3xN8qR5wY7zT1f",
      "pointsEarned": 5,
      "pointsAvailable": 5
    },
    {
      "questionId": "5XvW8nM2kL9pQ4rY6zT3h",
      "pointsEarned": 0,
      "pointsAvailable": 3
    }
  ],
  "questionFeedback": [
    {
      "questionId": "2KmP9vL3xN8qR5wY7zT1f",
      "feedback": "Perfect!"
    }
  ],
  "overallFeedback": "Great work overall!"
}
```

### Step 3: Student Views Result

```http
GET /learn/assessment/assess-uuid-789
Authorization: Bearer student-token
```

**Frontend receives:**
- List of questions with options
- Their answers (option IDs)
- Correct answers (option IDs)
- Points earned/available
- Feedback

**Frontend displays:**
- "You selected: Option 2 - To show that Maya..." (with ✗ if incorrect)
- "Correct answer: Option 1 - To suggest that..." (if show correct answer)
- Points: 0 / 3
- Feedback: "Try re-reading that section"

---

## Summary

Both endpoints provide complete question data including:
- ✅ Full `options` array with `id`, `text`, and optional `imageUrl`
- ✅ Student's answer as option `id`
- ✅ Correct answer as option `id`
- ✅ Points and grading information
- ✅ Feedback (if provided)

Frontend needs to:
1. Check if `questionContent.options` exists (multiple choice)
2. Map option IDs to option objects using `find()`
3. Display option text and images
4. Show comparison between student and correct answers
5. Handle edge cases (missing answer, invalid ID, etc.)
