# Frontend Helpers for Multiple Choice JSON Format

This guide provides TypeScript utility functions and React component examples for working with the new multiple choice question format.

## Type Definitions

```typescript
// Add to your frontend types file
export type MultipleChoiceOption = {
  id: string;
  text: string;
  imageUrl?: string;
};

export type QuestionContent = {
  options?: MultipleChoiceOption[];
  type?: string;
};

export type AssessmentQuestion = {
  questionId: string;
  questionText: string;
  questionContent?: QuestionContent;
  pointsAvailable: number;
  pointsEarned: number;
  feedback: string | null;
  userAnswer: unknown;
  correctAnswer?: unknown;
};
```

## Utility Functions

### 1. Get Option by ID

```typescript
/**
 * Find an option by its ID from the options array
 */
export function getOptionById(
  options: MultipleChoiceOption[] | undefined,
  optionId: unknown
): MultipleChoiceOption | null {
  if (!options || !optionId) return null;
  
  const id = String(optionId);
  return options.find(opt => opt.id === id) || null;
}
```

### 2. Check if Question is Multiple Choice

```typescript
/**
 * Determine if a question uses the JSON multiple choice format
 */
export function isMultipleChoiceWithOptions(
  questionContent?: QuestionContent
): boolean {
  return (
    questionContent?.type === "questionMultipleChoice" &&
    Array.isArray(questionContent?.options) &&
    questionContent.options.length > 0
  );
}
```

### 3. Format Answer Display

```typescript
/**
 * Get a display-friendly version of an answer
 * Returns either the option text (for multiple choice) or the raw answer
 */
export function formatAnswerForDisplay(
  answer: unknown,
  questionContent?: QuestionContent
): string {
  if (!answer) return "No answer provided";
  
  if (isMultipleChoiceWithOptions(questionContent)) {
    const option = getOptionById(questionContent?.options, answer);
    return option?.text || `Invalid option: ${answer}`;
  }
  
  // For non-multiple choice, return the raw answer
  return String(answer);
}
```

### 4. Validate Answer

```typescript
/**
 * Check if a selected answer is valid for a multiple choice question
 */
export function isValidMultipleChoiceAnswer(
  answerId: string,
  options: MultipleChoiceOption[]
): boolean {
  return options.some(opt => opt.id === answerId);
}
```

## React Components

### 1. Admin Review - Multiple Choice Display

```typescript
import React from 'react';

interface MultipleChoiceReviewProps {
  question: AssessmentQuestion;
}

export function MultipleChoiceReview({ question }: MultipleChoiceReviewProps) {
  const { questionContent, userAnswer, correctAnswer } = question;
  
  if (!isMultipleChoiceWithOptions(questionContent)) {
    // Fallback for non-multiple choice questions
    return (
      <div className="simple-answer-review">
        <div>
          <strong>Student Answer:</strong> {String(userAnswer || 'No answer')}
        </div>
        <div>
          <strong>Correct Answer:</strong> {String(correctAnswer || 'N/A')}
        </div>
      </div>
    );
  }

  const options = questionContent!.options!;
  const studentOption = getOptionById(options, userAnswer);
  const correctOption = getOptionById(options, correctAnswer);
  const isCorrect = String(userAnswer) === String(correctAnswer);

  return (
    <div className="multiple-choice-review">
      <h4>Question: {question.questionText}</h4>
      
      {/* Student Answer */}
      <div className={`answer-section ${isCorrect ? 'correct' : 'incorrect'}`}>
        <h5>
          Student Answer: {isCorrect ? '✓ Correct' : '✗ Incorrect'}
        </h5>
        {studentOption ? (
          <div className="option-display">
            <p className="option-text">{studentOption.text}</p>
            {studentOption.imageUrl && (
              <img 
                src={studentOption.imageUrl} 
                alt="Student selected option"
                className="option-image"
              />
            )}
          </div>
        ) : (
          <p className="no-answer">No answer selected</p>
        )}
      </div>

      {/* Correct Answer (if different) */}
      {!isCorrect && correctOption && (
        <div className="answer-section correct-answer">
          <h5>Correct Answer:</h5>
          <div className="option-display">
            <p className="option-text">{correctOption.text}</p>
            {correctOption.imageUrl && (
              <img 
                src={correctOption.imageUrl} 
                alt="Correct option"
                className="option-image"
              />
            )}
          </div>
        </div>
      )}

      {/* Grading Section */}
      <div className="grading-info">
        <p>
          Points: {question.pointsEarned} / {question.pointsAvailable}
        </p>
        {question.feedback && (
          <div className="feedback">
            <strong>Feedback:</strong>
            <p>{question.feedback}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 2. Student View - Completed Assessment

```typescript
import React from 'react';

interface StudentAnswerDisplayProps {
  question: AssessmentQuestion;
  showCorrectAnswer?: boolean;
}

export function StudentAnswerDisplay({ 
  question, 
  showCorrectAnswer = false 
}: StudentAnswerDisplayProps) {
  const { questionContent, userAnswer, correctAnswer, pointsEarned, pointsAvailable } = question;
  
  if (!isMultipleChoiceWithOptions(questionContent)) {
    return (
      <div className="student-answer-display">
        <p><strong>Your Answer:</strong> {String(userAnswer || 'No answer')}</p>
        <p><strong>Points:</strong> {pointsEarned} / {pointsAvailable}</p>
      </div>
    );
  }

  const options = questionContent!.options!;
  const studentOption = getOptionById(options, userAnswer);
  const correctOption = getOptionById(options, correctAnswer);
  const isCorrect = String(userAnswer) === String(correctAnswer);

  return (
    <div className="student-answer-display">
      <h4>{question.questionText}</h4>

      <div className={`your-answer ${isCorrect ? 'correct' : 'incorrect'}`}>
        <h5>Your Answer:</h5>
        {studentOption ? (
          <>
            <p>{studentOption.text}</p>
            {studentOption.imageUrl && (
              <img src={studentOption.imageUrl} alt="Your answer" />
            )}
          </>
        ) : (
          <p>No answer selected</p>
        )}
        <p className="result">
          {isCorrect ? '✓ Correct' : '✗ Incorrect'}
        </p>
      </div>

      {showCorrectAnswer && !isCorrect && correctOption && (
        <div className="correct-answer-hint">
          <h5>Correct Answer:</h5>
          <p>{correctOption.text}</p>
          {correctOption.imageUrl && (
            <img src={correctOption.imageUrl} alt="Correct answer" />
          )}
        </div>
      )}

      <div className="points-earned">
        <strong>Points:</strong> {pointsEarned} / {pointsAvailable}
      </div>

      {question.feedback && (
        <div className="teacher-feedback">
          <strong>Teacher Feedback:</strong>
          <p>{question.feedback}</p>
        </div>
      )}
    </div>
  );
}
```

### 3. Student Answering Question (During Assessment)

```typescript
import React, { useState } from 'react';

interface MultipleChoiceQuestionProps {
  questionId: string;
  questionText: string;
  options: MultipleChoiceOption[];
  currentAnswer?: string;
  onAnswerChange: (questionId: string, answerId: string) => void;
}

export function MultipleChoiceQuestion({
  questionId,
  questionText,
  options,
  currentAnswer,
  onAnswerChange
}: MultipleChoiceQuestionProps) {
  const [selectedId, setSelectedId] = useState<string>(currentAnswer || '');

  const handleSelect = (optionId: string) => {
    setSelectedId(optionId);
    onAnswerChange(questionId, optionId);
  };

  return (
    <div className="multiple-choice-question">
      <h3>{questionText}</h3>
      
      <div className="options-list">
        {options.map((option) => (
          <button
            key={option.id}
            className={`option-button ${selectedId === option.id ? 'selected' : ''}`}
            onClick={() => handleSelect(option.id)}
            type="button"
          >
            <div className="option-content">
              <span className="option-label">Option {option.id}</span>
              <p className="option-text">{option.text}</p>
              {option.imageUrl && (
                <img 
                  src={option.imageUrl} 
                  alt={`Option ${option.id}`}
                  className="option-image"
                />
              )}
            </div>
            {selectedId === option.id && (
              <span className="selected-indicator">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 4. Admin - All Options Display

```typescript
import React from 'react';

interface AllOptionsDisplayProps {
  options: MultipleChoiceOption[];
  correctAnswerId: unknown;
  studentAnswerId?: unknown;
}

export function AllOptionsDisplay({ 
  options, 
  correctAnswerId,
  studentAnswerId 
}: AllOptionsDisplayProps) {
  const correctId = String(correctAnswerId);
  const studentId = studentAnswerId ? String(studentAnswerId) : null;

  return (
    <div className="all-options-display">
      <h5>All Options:</h5>
      <div className="options-grid">
        {options.map((option) => {
          const isCorrect = option.id === correctId;
          const isStudentChoice = option.id === studentId;

          return (
            <div 
              key={option.id}
              className={`option-card ${isCorrect ? 'correct' : ''} ${isStudentChoice ? 'student-choice' : ''}`}
            >
              <div className="option-header">
                <span className="option-id">Option {option.id}</span>
                {isCorrect && <span className="badge correct-badge">Correct</span>}
                {isStudentChoice && <span className="badge student-badge">Student Selected</span>}
              </div>
              
              <p className="option-text">{option.text}</p>
              
              {option.imageUrl && (
                <img 
                  src={option.imageUrl} 
                  alt={`Option ${option.id}`}
                  className="option-image"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

## CSS Styles

```css
/* Multiple Choice Answer Review */
.multiple-choice-review {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.answer-section {
  margin: 15px 0;
  padding: 15px;
  border-radius: 6px;
}

.answer-section.correct {
  background-color: #e8f5e9;
  border-left: 4px solid #4caf50;
}

.answer-section.incorrect {
  background-color: #ffebee;
  border-left: 4px solid #f44336;
}

.option-display {
  margin-top: 10px;
}

.option-text {
  font-size: 16px;
  line-height: 1.5;
  margin-bottom: 10px;
}

.option-image {
  max-width: 100%;
  height: auto;
  max-height: 300px;
  border-radius: 4px;
  margin-top: 10px;
}

/* Student Answering */
.multiple-choice-question {
  margin: 20px 0;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 15px;
}

.option-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.option-button:hover {
  border-color: #2196f3;
  background-color: #f5f5f5;
}

.option-button.selected {
  border-color: #2196f3;
  background-color: #e3f2fd;
}

.option-content {
  flex: 1;
}

.option-label {
  font-weight: 600;
  color: #666;
  font-size: 14px;
}

.selected-indicator {
  font-size: 24px;
  color: #2196f3;
  margin-left: 12px;
}

/* All Options Grid */
.all-options-display {
  margin: 20px 0;
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-top: 12px;
}

.option-card {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  background: white;
}

.option-card.correct {
  border-color: #4caf50;
  background-color: #f1f8f4;
}

.option-card.student-choice {
  border-color: #2196f3;
}

.option-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.correct-badge {
  background-color: #4caf50;
  color: white;
}

.student-badge {
  background-color: #2196f3;
  color: white;
}
```

## Usage Examples

### Admin Review Page

```typescript
import React, { useEffect, useState } from 'react';
import { MultipleChoiceReview } from './components/MultipleChoiceReview';
import { AllOptionsDisplay } from './components/AllOptionsDisplay';

function AdminReviewPage({ enrollmentId }: { enrollmentId: string }) {
  const [reviewData, setReviewData] = useState(null);

  useEffect(() => {
    fetch(`/admin/review/${enrollmentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Api-Key': API_KEY,
      },
      body: JSON.stringify({ adminUserId: getCurrentAdminUserId() }),
    })
      .then(res => res.json())
      .then(setReviewData);
  }, [enrollmentId]);

  if (!reviewData) return <div>Loading...</div>;

  return (
    <div className="admin-review">
      <h1>Assessment Review</h1>
      <h2>{reviewData.content.name}</h2>
      <p>Student: {reviewData.student.name}</p>

      {reviewData.questions.map((question) => (
        <div key={question.questionId}>
          <MultipleChoiceReview question={question} />
          
          {/* Optionally show all options */}
          {question.questionContent?.options && (
            <AllOptionsDisplay 
              options={question.questionContent.options}
              correctAnswerId={question.correctAnswer}
              studentAnswerId={question.studentAnswer}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

### Student Completed Assessment Page

```typescript
import React, { useEffect, useState } from 'react';
import { StudentAnswerDisplay } from './components/StudentAnswerDisplay';

function StudentAssessmentResultPage({ assessmentId }: { assessmentId: string }) {
  const [assessment, setAssessment] = useState(null);

  useEffect(() => {
    fetch(`/learn/assessment/${assessmentId}`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    })
      .then(res => res.json())
      .then(setAssessment);
  }, [assessmentId]);

  if (!assessment) return <div>Loading...</div>;

  return (
    <div className="assessment-results">
      <h1>Assessment Results</h1>
      <h2>{assessment.enrollmentName}</h2>
      
      <div className="score-summary">
        <p>
          You scored <strong>{assessment.totalPointsEarned}</strong> out of{' '}
          <strong>{assessment.totalPointsAvailable}</strong> points
        </p>
      </div>

      {assessment.assessmentFeedback && (
        <div className="overall-feedback">
          <h3>Teacher Feedback</h3>
          <p>{assessment.assessmentFeedback}</p>
        </div>
      )}

      <div className="questions">
        <h3>Your Answers</h3>
        {assessment.questions.map((question) => (
          <StudentAnswerDisplay 
            key={question.questionId}
            question={question}
            showCorrectAnswer={true}
          />
        ))}
      </div>
    </div>
  );
}
```

## Testing Utilities

```typescript
// Test helpers for unit tests

export const mockMultipleChoiceQuestion: AssessmentQuestion = {
  questionId: 'q123',
  questionText: 'Why did the author include this paragraph?',
  questionContent: {
    type: 'questionMultipleChoice',
    options: [
      { id: '1', text: 'To suggest that another mystery may have happened.' },
      { id: '2', text: 'To show that Maya did not understand the clues.' },
      { id: '3', text: 'To prove that Oliver was lying.' },
      { id: '4', text: 'To explain why the library clock stopped.' }
    ]
  },
  pointsAvailable: 5,
  pointsEarned: 5,
  feedback: 'Excellent understanding!',
  userAnswer: '2',
  correctAnswer: '2'
};

export const mockMultipleChoiceQuestionWithImage: AssessmentQuestion = {
  ...mockMultipleChoiceQuestion,
  questionContent: {
    type: 'questionMultipleChoice',
    options: [
      { 
        id: '1', 
        text: 'A circle', 
        imageUrl: 'https://example.com/circle.jpg' 
      },
      { 
        id: '2', 
        text: 'A square', 
        imageUrl: 'https://example.com/square.jpg' 
      }
    ]
  }
};

// Test the helper functions
describe('Multiple Choice Helpers', () => {
  test('getOptionById returns correct option', () => {
    const options = mockMultipleChoiceQuestion.questionContent!.options!;
    const option = getOptionById(options, '2');
    expect(option?.text).toBe('To show that Maya did not understand the clues.');
  });

  test('isMultipleChoiceWithOptions returns true for MC questions', () => {
    expect(isMultipleChoiceWithOptions(mockMultipleChoiceQuestion.questionContent))
      .toBe(true);
  });

  test('formatAnswerForDisplay returns option text', () => {
    const formatted = formatAnswerForDisplay(
      '2', 
      mockMultipleChoiceQuestion.questionContent
    );
    expect(formatted).toBe('To show that Maya did not understand the clues.');
  });
});
```

## Error Handling

```typescript
/**
 * Safe wrapper for getting option text
 */
export function getOptionTextSafe(
  options: MultipleChoiceOption[] | undefined,
  optionId: unknown,
  fallback: string = 'Unknown option'
): string {
  if (!options || !optionId) return fallback;
  
  const option = getOptionById(options, optionId);
  return option?.text || fallback;
}

/**
 * Validate that all required option fields are present
 */
export function validateOption(option: unknown): option is MultipleChoiceOption {
  if (!option || typeof option !== 'object') return false;
  
  const opt = option as Record<string, unknown>;
  return (
    typeof opt.id === 'string' &&
    opt.id.length > 0 &&
    typeof opt.text === 'string' &&
    opt.text.length > 0
  );
}

/**
 * Filter out invalid options
 */
export function sanitizeOptions(
  options: unknown
): MultipleChoiceOption[] {
  if (!Array.isArray(options)) return [];
  
  return options.filter(validateOption);
}
```

## Summary

Use these utilities to:

1. **Display answers** - Convert option IDs to full text/images
2. **Validate input** - Ensure selected options are valid
3. **Format output** - Show answers consistently across the app
4. **Handle errors** - Gracefully handle missing or invalid data

All components are backward compatible with non-JSON multiple choice formats.
