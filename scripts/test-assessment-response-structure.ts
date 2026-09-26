/**
 * Test script to verify the assessment detail response structure
 * includes the new questionType and options fields
 */

import type { AssessmentDetailQuestion } from "../src/lib/assessments.js";

// Test that the type includes the required fields
const mockQuestion: AssessmentDetailQuestion = {
  questionId: "test-question-123",
  questionText: "Why did the author include this paragraph?",
  questionType: "questionMultipleChoice",
  options: [
    {
      id: "1",
      text: "To suggest that another mystery may have happened.",
    },
    {
      id: "2",
      text: "To show that Maya did not understand the clues.",
    },
    {
      id: "3",
      text: "To prove that Oliver was lying.",
    },
  ],
  pointsAvailable: 5,
  pointsEarned: 5,
  feedback: "Excellent work!",
  userAnswer: "2",
  correctAnswer: "2",
};

// Test backward compatibility - question without options
const mockTextQuestion: AssessmentDetailQuestion = {
  questionId: "text-question-456",
  questionText: "Explain your reasoning",
  pointsAvailable: 10,
  pointsEarned: 8,
  feedback: "Good explanation, but could be more detailed",
  userAnswer: "This is my written answer explaining my reasoning.",
};

console.log("✓ Multiple choice question structure is valid");
console.log(JSON.stringify(mockQuestion, null, 2));
console.log();

console.log("✓ Text question structure is valid (backward compatible)");
console.log(JSON.stringify(mockTextQuestion, null, 2));
console.log();

// Verify the new fields are accessible
if (mockQuestion.questionType === "questionMultipleChoice") {
  console.log("✓ questionType field is accessible");
  
  if (mockQuestion.options && mockQuestion.options.length > 0) {
    console.log("✓ options field is accessible");
    console.log(`  Found ${mockQuestion.options.length} options`);
    
    // Find the selected option
    const selectedOption = mockQuestion.options.find(
      opt => opt.id === mockQuestion.userAnswer
    );
    
    if (selectedOption) {
      console.log("✓ Can map userAnswer to option text");
      console.log(`  User selected: "${selectedOption.text}"`);
    }
  }
}

console.log();
console.log("All structure tests passed! ✓");
