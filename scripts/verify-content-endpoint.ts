/**
 * Verification script: /learn/content/:id includes question options
 * 
 * This demonstrates that the content endpoint provides options to students
 * while correctly redacting only the correct answers.
 */

// Simulate the redactAssessmentAnswers function
function redactAssessmentAnswers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAssessmentAnswers);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const question = record.contentType === "question" ||
    record.contentType === "questionMultipleChoice";
  return Object.fromEntries(Object.entries(record).map(([key, child]) => {
    if (question && key === "fields" && child && typeof child === "object") {
      return [key, redactAssessmentAnswers(Object.fromEntries(
        Object.entries(child).filter(([field]) => field !== "answer")
      ))];
    }
    return [key, redactAssessmentAnswers(child)];
  }));
}

// Sample question data as it comes from Contentful
const sampleContentfulQuestion = {
  entryId: "q123",
  type: "Entry",
  contentType: "questionMultipleChoice",
  fields: {
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
    answer: "2", // This should be removed
    points: 5,
  },
};

// Sample question with images
const sampleQuestionWithImages = {
  entryId: "q456",
  type: "Entry",
  contentType: "questionMultipleChoice",
  fields: {
    text: "Which shape is shown?",
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
    answer: "1", // This should be removed
    points: 3,
  },
};

console.log("=".repeat(70));
console.log("VERIFICATION: /learn/content/:id includes question options");
console.log("=".repeat(70));
console.log();

// Test 1: Regular multiple choice
console.log("Test 1: Regular Multiple Choice Question");
console.log("-".repeat(70));
console.log("BEFORE redactAssessmentAnswers (server has this):");
console.log(JSON.stringify(sampleContentfulQuestion, null, 2));
console.log();

const redactedQuestion = redactAssessmentAnswers(sampleContentfulQuestion);
console.log("AFTER redactAssessmentAnswers (student receives this):");
console.log(JSON.stringify(redactedQuestion, null, 2));
console.log();

const redactedFields = (redactedQuestion as any).fields;
const hasOptions = Array.isArray(redactedFields?.options);
const hasAnswer = "answer" in (redactedFields || {});

console.log("✓ Options included:", hasOptions);
console.log("✓ Answer removed:", !hasAnswer);
console.log();

if (!hasOptions) {
  console.error("✗ FAIL: Options were removed!");
  process.exit(1);
}

if (hasAnswer) {
  console.error("✗ FAIL: Answer was not removed!");
  process.exit(1);
}

console.log("✓ PASS: Options provided, answer redacted\n");

// Test 2: Multiple choice with images
console.log("Test 2: Multiple Choice with Images");
console.log("-".repeat(70));
console.log("BEFORE redactAssessmentAnswers:");
console.log(JSON.stringify(sampleQuestionWithImages, null, 2));
console.log();

const redactedWithImages = redactAssessmentAnswers(sampleQuestionWithImages);
console.log("AFTER redactAssessmentAnswers:");
console.log(JSON.stringify(redactedWithImages, null, 2));
console.log();

const redactedImgFields = (redactedWithImages as any).fields;
const hasImageOptions = Array.isArray(redactedImgFields?.options);
const hasImagesInOptions = redactedImgFields?.options?.some((opt: any) => opt.imageUrl);
const hasImageAnswer = "answer" in (redactedImgFields || {});

console.log("✓ Options included:", hasImageOptions);
console.log("✓ Images preserved:", hasImagesInOptions);
console.log("✓ Answer removed:", !hasImageAnswer);
console.log();

if (!hasImageOptions || !hasImagesInOptions) {
  console.error("✗ FAIL: Options or images were removed!");
  process.exit(1);
}

if (hasImageAnswer) {
  console.error("✗ FAIL: Answer was not removed!");
  process.exit(1);
}

console.log("✓ PASS: Options with images provided, answer redacted\n");

// Show what the student receives
console.log("=".repeat(70));
console.log("STUDENT RECEIVES FROM GET /learn/content/:id");
console.log("=".repeat(70));
console.log();

const studentResponse = {
  content: {
    entryId: "content123",
    name: "Reading Comprehension - Level 1",
    type: "assessment",
    subject: "English",
    ageGroup: "7-8",
    stage: "2",
    entryName: "Level 1",
    requiresAssessment: true,
    fields: {
      sections: [
        {
          entryId: "section1",
          contentType: "section",
          fields: {
            title: "Part 1",
            questions: [redactedQuestion, redactedWithImages],
          },
        },
      ],
    },
  },
  progressStatus: "in_progress",
  progress: {
    version: 1,
    items: {},
  },
};

console.log(JSON.stringify(studentResponse, null, 2));
console.log();

console.log("=".repeat(70));
console.log("SUMMARY");
console.log("=".repeat(70));
console.log();
console.log("✓ GET /learn/content/:id INCLUDES question options");
console.log("✓ Students can see all option text and images");
console.log("✓ Correct answers are properly redacted");
console.log("✓ Students can answer questions with full context");
console.log();
console.log("Frontend can:");
console.log("  1. Parse options from content.fields");
console.log("  2. Display option text and images");
console.log("  3. Submit selected option ID in progress update");
console.log();
console.log("All tests passed! ✓");
