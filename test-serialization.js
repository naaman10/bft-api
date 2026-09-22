// Test the toJsonValue serialization
const { toJsonValue } = require('./dist/lib/content.js');

// Simulate a Contentful question entry structure
const mockQuestion = {
  sys: {
    id: "question-123",
    type: "Entry",
    contentType: {
      sys: { id: "question" }
    }
  },
  fields: {
    question: "What is 2+2?",
    answer: "4",
    points: 2
  }
};

// Since toJsonValue is not exported, let me check the actual structure
console.log("Mock question structure:", JSON.stringify(mockQuestion, null, 2));
