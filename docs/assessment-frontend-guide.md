# Assessment System Frontend Integration Guide

This guide shows how to integrate the assessment system into an admin frontend application.

## Overview

The assessment workflow consists of:

1. **Review** - View student's submitted answers alongside correct answers
2. **Grade** - Assign points to each question
3. **Feedback** - Provide question-level and overall feedback
4. **Complete** - Finalize the assessment and award points

## API Endpoints Quick Reference

```typescript
// Get review data (existing endpoint)
POST /admin/review/:enrollmentId
Body: { adminUserId: string }

// Save/update assessment
POST /admin/assessment/:enrollmentId
Body: {
  assessedBy: string;
  questionGrades?: QuestionGrade[];
  questionFeedback?: QuestionFeedback[];
  overallFeedback?: string;
}

// Complete assessment
POST /admin/assessment/:enrollmentId/complete
Body: { assessedBy: string }

// Get existing assessment
GET /admin/assessment/:enrollmentId

// Add general feedback
POST /admin/enrollment/:enrollmentId/feedback
Body: { feedback: string; createdBy: string }

// List feedback
GET /admin/enrollment/:enrollmentId/feedback
```

## Implementation Examples

### 1. Assessment Review Page

Display student answers alongside correct answers for grading.

```typescript
interface ReviewData {
  enrollment: {
    id: string;
    studentId: string;
    contentId: string;
    progressStatus: string;
    completedAt: string;
  };
  student: {
    id: string;
    name: string;
    email: string;
  };
  content: {
    entryId: string;
    name: string;
    requiresAssessment: boolean;
  };
  questions: Array<{
    questionId: string;
    questionContent: any;
    studentAnswer: any;
    correctAnswer: any;
    points: number;
    status: string;
  }>;
}

async function loadReviewData(enrollmentId: string): Promise<ReviewData> {
  const response = await fetch(`/admin/review/${enrollmentId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      adminUserId: getCurrentAdminUserId(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load review data: ${response.statusText}`);
  }

  return response.json();
}

// Usage in React component
function AssessmentReviewPage({ enrollmentId }: { enrollmentId: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReviewData(enrollmentId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enrollmentId]);

  if (loading) return <div>Loading...</div>;
  if (!data) return <div>Failed to load</div>;

  return (
    <div>
      <h1>Assessment Review</h1>
      <h2>{data.content.name}</h2>
      <p>Student: {data.student.name}</p>
      <p>Completed: {new Date(data.enrollment.completedAt).toLocaleString()}</p>
      
      {data.questions.map((q) => (
        <QuestionReview key={q.questionId} question={q} />
      ))}
    </div>
  );
}
```

### 2. Grading Interface

Allow admin to assign points and provide feedback for each question.

```typescript
interface QuestionGrade {
  questionId: string;
  pointsEarned: number;
  pointsAvailable: number;
}

interface QuestionFeedback {
  questionId: string;
  feedback: string;
}

interface GradingState {
  grades: Map<string, QuestionGrade>;
  feedback: Map<string, string>;
  overallFeedback: string;
}

function GradingForm({ 
  questions, 
  enrollmentId 
}: { 
  questions: ReviewData['questions'];
  enrollmentId: string;
}) {
  const [grades, setGrades] = useState<Map<string, QuestionGrade>>(new Map());
  const [feedback, setFeedback] = useState<Map<string, string>>(new Map());
  const [overallFeedback, setOverallFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  const handleGradeChange = (
    questionId: string, 
    pointsEarned: number, 
    pointsAvailable: number
  ) => {
    setGrades(new Map(grades).set(questionId, {
      questionId,
      pointsEarned,
      pointsAvailable,
    }));
  };

  const handleFeedbackChange = (questionId: string, text: string) => {
    setFeedback(new Map(feedback).set(questionId, text));
  };

  const saveAssessment = async () => {
    setSaving(true);
    
    try {
      const response = await fetch(`/admin/assessment/${enrollmentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Api-Key': API_KEY,
        },
        body: JSON.stringify({
          assessedBy: getCurrentAdminUserId(),
          questionGrades: Array.from(grades.values()),
          questionFeedback: Array.from(feedback.entries())
            .filter(([_, text]) => text.trim())
            .map(([questionId, feedbackText]) => ({
              questionId,
              feedback: feedbackText,
            })),
          overallFeedback: overallFeedback.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save assessment');
      }

      alert('Assessment saved successfully!');
    } catch (error) {
      console.error(error);
      alert(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {questions.map((q) => (
        <div key={q.questionId} className="question-card">
          <h3>Question (Worth {q.points} points)</h3>
          
          {/* Display question content */}
          <div className="question-content">
            {/* Render question based on type */}
            {JSON.stringify(q.questionContent)}
          </div>

          {/* Display student answer */}
          <div className="student-answer">
            <strong>Student Answer:</strong> {JSON.stringify(q.studentAnswer)}
          </div>

          {/* Display correct answer */}
          <div className="correct-answer">
            <strong>Correct Answer:</strong> {JSON.stringify(q.correctAnswer)}
          </div>

          {/* Grading input */}
          <div className="grading-input">
            <label>
              Points Earned:
              <input
                type="number"
                min={0}
                max={q.points}
                value={grades.get(q.questionId)?.pointsEarned ?? ''}
                onChange={(e) => 
                  handleGradeChange(
                    q.questionId, 
                    parseInt(e.target.value) || 0, 
                    q.points
                  )
                }
              />
              / {q.points}
            </label>
          </div>

          {/* Feedback textarea */}
          <div className="feedback-input">
            <label>
              Feedback (optional):
              <textarea
                value={feedback.get(q.questionId) ?? ''}
                onChange={(e) => 
                  handleFeedbackChange(q.questionId, e.target.value)
                }
                placeholder="Provide feedback for this question..."
              />
            </label>
          </div>
        </div>
      ))}

      {/* Overall feedback */}
      <div className="overall-feedback">
        <label>
          Overall Assessment Feedback:
          <textarea
            value={overallFeedback}
            onChange={(e) => setOverallFeedback(e.target.value)}
            placeholder="Provide overall feedback for the entire assessment..."
          />
        </label>
      </div>

      {/* Action buttons */}
      <div className="actions">
        <button onClick={saveAssessment} disabled={saving}>
          {saving ? 'Saving...' : 'Save Progress'}
        </button>
      </div>
    </div>
  );
}
```

### 3. Complete Assessment

Finalize the assessment after all questions are graded.

```typescript
async function completeAssessment(enrollmentId: string): Promise<void> {
  const confirmed = confirm(
    'Are you sure you want to complete this assessment? ' +
    'This will award points to the student and cannot be undone.'
  );

  if (!confirmed) return;

  const response = await fetch(
    `/admin/assessment/${enrollmentId}/complete`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Api-Key': API_KEY,
      },
      body: JSON.stringify({
        assessedBy: getCurrentAdminUserId(),
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to complete assessment');
  }

  const result = await response.json();
  return result;
}

// Complete button component
function CompleteAssessmentButton({ 
  enrollmentId, 
  onComplete 
}: { 
  enrollmentId: string;
  onComplete: () => void;
}) {
  const [completing, setCompleting] = useState(false);

  const handleComplete = async () => {
    setCompleting(true);
    
    try {
      await completeAssessment(enrollmentId);
      alert('Assessment completed successfully! Points have been awarded.');
      onComplete();
    } catch (error) {
      if (error.message.includes('Missing grades')) {
        alert('Please grade all questions before completing the assessment.');
      } else {
        alert(`Failed to complete assessment: ${error.message}`);
      }
    } finally {
      setCompleting(false);
    }
  };

  return (
    <button 
      onClick={handleComplete} 
      disabled={completing}
      className="btn-primary"
    >
      {completing ? 'Completing...' : 'Complete Assessment'}
    </button>
  );
}
```

### 4. Load Existing Assessment

Resume grading a saved assessment.

```typescript
async function loadExistingAssessment(enrollmentId: string) {
  const response = await fetch(`/admin/assessment/${enrollmentId}`, {
    method: 'GET',
    headers: {
      'X-Admin-Api-Key': API_KEY,
    },
  });

  if (response.status === 404) {
    // No assessment exists yet
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to load assessment');
  }

  return response.json();
}

// Usage: Pre-fill form with existing grades and feedback
function AssessmentPage({ enrollmentId }: { enrollmentId: string }) {
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [existingAssessment, setExistingAssessment] = useState(null);

  useEffect(() => {
    Promise.all([
      loadReviewData(enrollmentId),
      loadExistingAssessment(enrollmentId),
    ]).then(([review, assessment]) => {
      setReviewData(review);
      setExistingAssessment(assessment);
      
      // Pre-fill form with existing data if available
      if (assessment) {
        // Populate grades and feedback maps
      }
    });
  }, [enrollmentId]);

  // ... rest of component
}
```

### 5. General Feedback (Non-Assessment)

Add feedback to any enrollment, even those that don't require assessment.

```typescript
async function addGeneralFeedback(
  enrollmentId: string,
  feedback: string
): Promise<void> {
  const response = await fetch(
    `/admin/enrollment/${enrollmentId}/feedback`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Api-Key': API_KEY,
      },
      body: JSON.stringify({
        feedback,
        createdBy: getCurrentAdminUserId(),
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to add feedback');
  }
}

async function loadFeedbackHistory(
  enrollmentId: string
): Promise<Array<any>> {
  const response = await fetch(
    `/admin/enrollment/${enrollmentId}/feedback`,
    {
      method: 'GET',
      headers: {
        'X-Admin-Api-Key': API_KEY,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to load feedback');
  }

  const data = await response.json();
  return data.feedback;
}

// Feedback component
function FeedbackSection({ enrollmentId }: { enrollmentId: string }) {
  const [feedback, setFeedback] = useState('');
  const [history, setHistory] = useState<Array<any>>([]);

  useEffect(() => {
    loadFeedbackHistory(enrollmentId).then(setHistory);
  }, [enrollmentId]);

  const handleSubmit = async () => {
    await addGeneralFeedback(enrollmentId, feedback);
    setFeedback('');
    // Reload history
    const updated = await loadFeedbackHistory(enrollmentId);
    setHistory(updated);
  };

  return (
    <div>
      <h3>Feedback</h3>
      
      {/* Feedback history */}
      <div className="feedback-history">
        {history.map((item) => (
          <div key={item.id} className="feedback-item">
            <p>{item.feedback}</p>
            <small>
              {new Date(item.createdAt).toLocaleString()}
            </small>
          </div>
        ))}
      </div>

      {/* Add new feedback */}
      <div className="add-feedback">
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Add feedback..."
        />
        <button onClick={handleSubmit}>Add Feedback</button>
      </div>
    </div>
  );
}
```

## Error Handling

Handle common error cases gracefully:

```typescript
async function safeApiCall<T>(
  apiCall: () => Promise<T>,
  errorHandlers: Record<number, (error: any) => void> = {}
): Promise<T | null> {
  try {
    return await apiCall();
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const handler = errorHandlers[status];
      
      if (handler) {
        handler(error);
        return null;
      }

      // Default error handling
      switch (status) {
        case 400:
          alert('Invalid request. Please check your input.');
          break;
        case 403:
          alert('This enrollment cannot be assessed.');
          break;
        case 404:
          alert('Enrollment not found.');
          break;
        case 409:
          alert('This assessment is already completed.');
          break;
        default:
          alert('An error occurred. Please try again.');
      }
    } else {
      console.error(error);
      alert('Network error. Please check your connection.');
    }
    
    return null;
  }
}

// Usage
await safeApiCall(
  () => completeAssessment(enrollmentId),
  {
    400: (error) => {
      // Parse error details to show which questions are missing grades
      alert(`Cannot complete: ${error.message}`);
    },
  }
);
```

## UI/UX Best Practices

### 1. Auto-save

Implement auto-save to prevent data loss:

```typescript
function useAutoSave(
  enrollmentId: string,
  state: GradingState,
  interval = 30000 // 30 seconds
) {
  useEffect(() => {
    const timer = setInterval(() => {
      saveAssessment(enrollmentId, state);
    }, interval);

    return () => clearInterval(timer);
  }, [enrollmentId, state, interval]);
}
```

### 2. Progress Indicator

Show which questions have been graded:

```typescript
function GradingProgress({ 
  questions, 
  grades 
}: { 
  questions: any[];
  grades: Map<string, QuestionGrade>;
}) {
  const total = questions.length;
  const graded = grades.size;
  const percentage = (graded / total) * 100;

  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${percentage}%` }} />
      <span>{graded} / {total} questions graded</span>
    </div>
  );
}
```

### 3. Validation Feedback

Show real-time validation:

```typescript
function PointsInput({ 
  questionId, 
  maxPoints, 
  value, 
  onChange 
}: {
  questionId: string;
  maxPoints: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const [error, setError] = useState('');

  const handleChange = (newValue: number) => {
    if (newValue < 0) {
      setError('Points cannot be negative');
    } else if (newValue > maxPoints) {
      setError(`Points cannot exceed ${maxPoints}`);
    } else {
      setError('');
      onChange(newValue);
    }
  };

  return (
    <div>
      <input
        type="number"
        value={value}
        onChange={(e) => handleChange(parseInt(e.target.value) || 0)}
      />
      {error && <span className="error">{error}</span>}
    </div>
  );
}
```

## Testing

### Unit Tests

```typescript
describe('Assessment API', () => {
  it('should save assessment grades', async () => {
    const result = await saveAssessment(enrollmentId, {
      questionGrades: [
        { questionId: 'q1', pointsEarned: 5, pointsAvailable: 10 },
      ],
    });
    
    expect(result.questionGrades).toHaveLength(1);
  });

  it('should reject invalid points', async () => {
    await expect(
      saveAssessment(enrollmentId, {
        questionGrades: [
          { questionId: 'q1', pointsEarned: 15, pointsAvailable: 10 },
        ],
      })
    ).rejects.toThrow();
  });

  it('should complete assessment when all questions graded', async () => {
    // First save grades for all questions
    await saveAssessment(enrollmentId, {
      questionGrades: allQuestions.map(q => ({
        questionId: q.id,
        pointsEarned: q.points,
        pointsAvailable: q.points,
      })),
    });

    // Then complete
    const result = await completeAssessment(enrollmentId);
    expect(result.assessment.status).toBe('completed');
  });
});
```

## Summary

The assessment system provides a flexible workflow for grading enrollments:

1. Load review data with student answers and correct answers
2. Grade questions and provide feedback (save as you go)
3. Complete assessment to finalize and award points
4. Add general feedback any time

Key points:
- Save frequently to avoid losing work
- Validate inputs before submission
- Handle errors gracefully
- Provide clear feedback to admin users
- Show progress indicators
- Auto-save for better UX
