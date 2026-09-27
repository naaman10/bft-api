/**
 * Test script for Game Sessions API
 * 
 * This script tests the game sessions endpoints.
 * Run with: tsx scripts/test-game-sessions.ts
 * 
 * Make sure you have:
 * 1. Run the migration: npm run migrate
 * 2. Have the server running: npm run dev
 * 3. Set a valid JWT token below
 */

import "dotenv/config";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

// TODO: Replace with a valid JWT token from your auth system
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || "your_test_token_here";

interface GameSessionResponse {
  id: string;
  userId: string;
  gameType: string;
  score: number;
  maxScore: number;
  scorePercentage: number;
  timeElapsedSeconds: number | null;
  startedAt: string;
  completedAt: string | null;
  gameData: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

async function testCreateGameSession() {
  console.log("\n=== Testing POST /api/games/sessions ===");

  const sessionData = {
    gameType: "maths-quiz",
    score: 80,
    maxScore: 100,
    timeElapsed: 120,
    startedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
    completedAt: new Date().toISOString(),
    gameData: {
      totalQuestions: 10,
      correctAnswers: 8,
      yearGroup: "Year 6",
      subject: "Percentages",
      answers: [
        {
          questionId: "q1",
          userAnswer: "80%",
          correctAnswer: "80%",
          isCorrect: true,
          timeTaken: 12,
        },
      ],
    },
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/games/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionData),
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Created game session successfully");
      console.log("Session ID:", data.id);
      console.log("Score Percentage:", data.scorePercentage);
      return data as GameSessionResponse;
    } else {
      console.error("❌ Failed to create game session");
      console.error("Status:", response.status);
      console.error("Error:", data);
      return null;
    }
  } catch (error) {
    console.error("❌ Error creating game session:", error);
    return null;
  }
}

async function testListGameSessions() {
  console.log("\n=== Testing GET /api/games/sessions ===");

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/games/sessions?gameType=maths-quiz&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      }
    );

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Retrieved game sessions successfully");
      console.log("Number of sessions:", data.sessions.length);
      return data.sessions as GameSessionResponse[];
    } else {
      console.error("❌ Failed to retrieve game sessions");
      console.error("Status:", response.status);
      console.error("Error:", data);
      return [];
    }
  } catch (error) {
    console.error("❌ Error retrieving game sessions:", error);
    return [];
  }
}

async function testGetGameSessionById(sessionId: string) {
  console.log("\n=== Testing GET /api/games/sessions/:id ===");

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/games/sessions/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      }
    );

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Retrieved game session successfully");
      console.log("Session ID:", data.id);
      console.log("Game Type:", data.gameType);
      console.log("Score:", `${data.score}/${data.maxScore} (${data.scorePercentage}%)`);
      return data as GameSessionResponse;
    } else {
      console.error("❌ Failed to retrieve game session");
      console.error("Status:", response.status);
      console.error("Error:", data);
      return null;
    }
  } catch (error) {
    console.error("❌ Error retrieving game session:", error);
    return null;
  }
}

async function testValidation() {
  console.log("\n=== Testing Validation ===");

  // Test 1: Invalid score (greater than maxScore)
  console.log("\nTest: Score > Max Score");
  try {
    const response = await fetch(`${API_BASE_URL}/api/games/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gameType: "maths-quiz",
        score: 150,
        maxScore: 100,
        startedAt: new Date().toISOString(),
        gameData: {},
      }),
    });

    const data = await response.json();

    if (response.status === 400) {
      console.log("✅ Correctly rejected invalid score");
    } else {
      console.error("❌ Should have rejected invalid score");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }

  // Test 2: Invalid game type
  console.log("\nTest: Invalid Game Type");
  try {
    const response = await fetch(`${API_BASE_URL}/api/games/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gameType: "invalid-game",
        score: 50,
        maxScore: 100,
        startedAt: new Date().toISOString(),
        gameData: {},
      }),
    });

    const data = await response.json();

    if (response.status === 400) {
      console.log("✅ Correctly rejected invalid game type");
    } else {
      console.error("❌ Should have rejected invalid game type");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }

  // Test 3: Missing authentication
  console.log("\nTest: Missing Authentication");
  try {
    const response = await fetch(`${API_BASE_URL}/api/games/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gameType: "maths-quiz",
        score: 50,
        maxScore: 100,
        startedAt: new Date().toISOString(),
        gameData: {},
      }),
    });

    const data = await response.json();

    if (response.status === 401) {
      console.log("✅ Correctly rejected missing authentication");
    } else {
      console.error("❌ Should have rejected missing authentication");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

async function runTests() {
  console.log("🚀 Starting Game Sessions API Tests");
  console.log("API Base URL:", API_BASE_URL);

  if (AUTH_TOKEN === "your_test_token_here") {
    console.error("\n⚠️  WARNING: Using default test token. Set TEST_AUTH_TOKEN environment variable.");
    console.error("Tests may fail without a valid authentication token.\n");
  }

  // Run validation tests
  await testValidation();

  // Create a session
  const createdSession = await testCreateGameSession();

  if (createdSession) {
    // Get the session by ID
    await testGetGameSessionById(createdSession.id);
  }

  // List all sessions
  await testListGameSessions();

  console.log("\n✅ All tests completed!");
}

runTests().catch(console.error);
