/**
 * Test script for multiple choice questions with JSON options
 * 
 * This script demonstrates and tests the handling of the new multiple choice format.
 * Run with: node --loader ts-node/esm scripts/test-multiple-choice.ts
 * Or: npx tsx scripts/test-multiple-choice.ts
 */

// Inline version of answersMatch from points.ts for standalone testing
function normalizedPrimitive(value: unknown): string | number | boolean | null {
  if (typeof value === "string") {
    return value.trim().toLocaleLowerCase("en-GB");
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return null;
}

function answersMatch(actual: unknown, expected: unknown): boolean {
  const normalizedActual = normalizedPrimitive(actual);
  const normalizedExpected = normalizedPrimitive(expected);

  if (normalizedActual === null || normalizedExpected === null) {
    return false;
  }

  if (typeof normalizedExpected === "number") {
    if (
      typeof normalizedActual === "string" &&
      normalizedActual.length > 0 &&
      Number.isFinite(Number(normalizedActual))
    ) {
      return Number(normalizedActual) === normalizedExpected;
    }

    return normalizedActual === normalizedExpected;
  }

  if (typeof normalizedExpected === "string") {
    return String(normalizedActual).trim().toLocaleLowerCase("en-GB") === normalizedExpected;
  }

  return normalizedActual === normalizedExpected;
}

// Type definitions matching the new format
type MultipleChoiceOption = {
  id: string;
  text: string;
  imageUrl?: string;
};

type TestQuestion = {
  questionId: string;
  text: string;
  options: MultipleChoiceOption[];
  correctAnswer: string;
  points: number;
};

type TestCase = {
  name: string;
  question: TestQuestion;
  studentAnswer: string;
  expectedMatch: boolean;
  expectedPoints: number;
};

// Sample multiple choice questions
const sampleQuestions: TestQuestion[] = [
  {
    questionId: "q1",
    text: "Why did the author include this paragraph?",
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
      {
        id: "4",
        text: "To explain why the library clock stopped.",
      },
    ],
    correctAnswer: "2",
    points: 5,
  },
  {
    questionId: "q2",
    text: "Which shape is shown in the image?",
    options: [
      {
        id: "1",
        text: "Circle",
        imageUrl: "https://example.com/circle.jpg",
      },
      {
        id: "2",
        text: "Square",
        imageUrl: "https://example.com/square.jpg",
      },
      {
        id: "3",
        text: "Triangle",
        imageUrl: "https://example.com/triangle.jpg",
      },
    ],
    correctAnswer: "1",
    points: 3,
  },
];

// Test cases
const testCases: TestCase[] = [
  {
    name: "Correct answer - matches exactly",
    question: sampleQuestions[0],
    studentAnswer: "2",
    expectedMatch: true,
    expectedPoints: 5,
  },
  {
    name: "Incorrect answer - different option",
    question: sampleQuestions[0],
    studentAnswer: "3",
    expectedMatch: false,
    expectedPoints: 0,
  },
  {
    name: "Correct answer with image option",
    question: sampleQuestions[1],
    studentAnswer: "1",
    expectedMatch: true,
    expectedPoints: 3,
  },
  {
    name: "Incorrect answer with image option",
    question: sampleQuestions[1],
    studentAnswer: "2",
    expectedMatch: false,
    expectedPoints: 0,
  },
  {
    name: "No answer provided",
    question: sampleQuestions[0],
    studentAnswer: "",
    expectedMatch: false,
    expectedPoints: 0,
  },
  {
    name: "Invalid option ID",
    question: sampleQuestions[0],
    studentAnswer: "99",
    expectedMatch: false,
    expectedPoints: 0,
  },
];

// Helper function to get option by ID
function getOptionById(
  options: MultipleChoiceOption[],
  id: string
): MultipleChoiceOption | null {
  return options.find((opt) => opt.id === id) || null;
}

// Run tests
console.log("=".repeat(70));
console.log("MULTIPLE CHOICE QUESTION TESTS");
console.log("=".repeat(70));
console.log();

let passCount = 0;
let failCount = 0;

for (const testCase of testCases) {
  console.log(`Test: ${testCase.name}`);
  console.log("-".repeat(70));

  const { question, studentAnswer, expectedMatch, expectedPoints } = testCase;

  // Test answer matching
  const actualMatch = answersMatch(studentAnswer, question.correctAnswer);
  const matchResult = actualMatch === expectedMatch ? "✓ PASS" : "✗ FAIL";

  console.log(`Question: ${question.text}`);
  console.log(`Correct Answer ID: ${question.correctAnswer}`);
  
  const correctOption = getOptionById(question.options, question.correctAnswer);
  if (correctOption) {
    console.log(`Correct Answer Text: "${correctOption.text}"`);
  }

  console.log(`Student Answer ID: ${studentAnswer || "(empty)"}`);
  
  const studentOption = getOptionById(question.options, studentAnswer);
  if (studentOption) {
    console.log(`Student Answer Text: "${studentOption.text}"`);
    if (studentOption.imageUrl) {
      console.log(`Student Answer Image: ${studentOption.imageUrl}`);
    }
  }

  console.log();
  console.log(`Answer Match Test: ${matchResult}`);
  console.log(`  Expected: ${expectedMatch}, Actual: ${actualMatch}`);

  // Calculate points
  const actualPoints = actualMatch ? question.points : 0;
  const pointsResult = actualPoints === expectedPoints ? "✓ PASS" : "✗ FAIL";

  console.log(`Points Test: ${pointsResult}`);
  console.log(`  Expected: ${expectedPoints}, Actual: ${actualPoints}`);

  // Track results
  if (actualMatch === expectedMatch && actualPoints === expectedPoints) {
    passCount++;
    console.log("Overall: ✓ PASSED");
  } else {
    failCount++;
    console.log("Overall: ✗ FAILED");
  }

  console.log();
}

// Summary
console.log("=".repeat(70));
console.log("TEST SUMMARY");
console.log("=".repeat(70));
console.log(`Total Tests: ${testCases.length}`);
console.log(`Passed: ${passCount} ✓`);
console.log(`Failed: ${failCount} ${failCount > 0 ? "✗" : ""}`);
console.log(`Success Rate: ${((passCount / testCases.length) * 100).toFixed(1)}%`);
console.log();

// Demonstration of JSON format
console.log("=".repeat(70));
console.log("SAMPLE DATA STRUCTURES");
console.log("=".repeat(70));
console.log();

console.log("1. Question Options (JSON Array Format):");
console.log(JSON.stringify(sampleQuestions[0].options, null, 2));
console.log();

console.log("2. Student Progress Entry:");
const progressEntry = {
  status: "completed",
  answer: "2", // Option ID
  updatedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
};
console.log(JSON.stringify(progressEntry, null, 2));
console.log();

console.log("3. Full Enrollment Progress Structure:");
const enrollmentProgress = {
  version: 1,
  items: {
    [sampleQuestions[0].questionId]: {
      status: "completed",
      answer: "2",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    [sampleQuestions[1].questionId]: {
      status: "completed",
      answer: "1",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  },
};
console.log(JSON.stringify(enrollmentProgress, null, 2));
console.log();

console.log("4. Admin Review Question Response:");
const adminReviewQuestion = {
  questionId: sampleQuestions[0].questionId,
  questionContent: {
    text: sampleQuestions[0].text,
    options: sampleQuestions[0].options,
    points: sampleQuestions[0].points,
  },
  studentAnswer: "2",
  correctAnswer: "2",
  points: 5,
  status: "completed",
};
console.log(JSON.stringify(adminReviewQuestion, null, 2));
console.log();

console.log("5. Student Assessment Detail Response:");
const assessmentDetail = {
  questionId: sampleQuestions[0].questionId,
  questionText: sampleQuestions[0].text,
  questionContent: {
    options: sampleQuestions[0].options,
    type: "questionMultipleChoice",
  },
  pointsAvailable: 5,
  pointsEarned: 5,
  feedback: "Excellent understanding of the text!",
  userAnswer: "2",
  correctAnswer: "2",
};
console.log(JSON.stringify(assessmentDetail, null, 2));
console.log();

// Exit with appropriate code
if (failCount > 0) {
  console.error(`Tests failed! ${failCount} test(s) did not pass.`);
  process.exit(1);
} else {
  console.log("All tests passed! ✓");
  process.exit(0);
}
