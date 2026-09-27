/**
 * Test script to verify user ID resolution fix
 * 
 * This script specifically tests that:
 * 1. The JWT token's neon_user_id is correctly resolved to the internal student ID
 * 2. Game sessions are created with the correct internal student ID
 * 3. The foreign key constraint is satisfied
 * 
 * Run with: tsx scripts/test-user-id-resolution.ts
 */

import "dotenv/config";
import { getDb } from "../src/lib/db.js";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;

async function testUserIdResolution() {
  console.log("🚀 Testing User ID Resolution Fix\n");

  if (!AUTH_TOKEN) {
    console.error("❌ TEST_AUTH_TOKEN environment variable is required");
    console.error("   Set it to a valid JWT token from your auth system");
    process.exit(1);
  }

  // Step 1: Verify JWT token structure
  console.log("Step 1: Decoding JWT token (base64 payload)...");
  try {
    const parts = AUTH_TOKEN.split('.');
    if (parts.length !== 3) {
      console.error("❌ Invalid JWT token format");
      process.exit(1);
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const neonUserId = payload.sub || payload.user_id || payload.userId;
    
    console.log("✅ JWT token decoded successfully");
    console.log("   Neon User ID (from token):", neonUserId);
    console.log("   Email:", payload.email || "(not in token)");
    
    // Step 2: Verify student exists in database
    console.log("\nStep 2: Looking up student in database...");
    const sql = getDb();
    const students = await sql`
      SELECT id, email, name, neon_user_id 
      FROM students 
      WHERE neon_user_id = ${neonUserId}::uuid 
         OR id = ${neonUserId}::uuid
      LIMIT 1
    `;
    
    if (students.length === 0) {
      console.error("❌ No student found for neon_user_id:", neonUserId);
      console.error("   The user needs to be created in the students table first");
      console.error("   You can do this via the admin interface or by running a migration");
      process.exit(1);
    }
    
    const student = students[0];
    console.log("✅ Student found in database");
    console.log("   Internal Student ID:", student.id);
    console.log("   Neon User ID:", student.neon_user_id);
    console.log("   Email:", student.email);
    console.log("   Name:", student.name);
    
    // Step 3: Create a game session via API
    console.log("\nStep 3: Creating game session via API...");
    const sessionData = {
      gameType: "maths-quiz",
      score: 85,
      maxScore: 100,
      timeElapsed: 90,
      startedAt: new Date(Date.now() - 90 * 1000).toISOString(),
      completedAt: new Date().toISOString(),
      gameData: {
        totalQuestions: 10,
        correctAnswers: 8,
        yearGroup: "Year 6",
        subject: "Fractions",
        testType: "user-id-resolution-test"
      },
    };

    const response = await fetch(`${API_BASE_URL}/api/games/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionData),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("❌ Failed to create game session");
      console.error("   Status:", response.status);
      console.error("   Error:", responseData);
      
      if (responseData.error?.includes("foreign key constraint")) {
        console.error("\n🐛 THE USER ID MAPPING FIX DID NOT WORK!");
        console.error("   The API is still trying to use neon_user_id instead of internal student ID");
      }
      
      process.exit(1);
    }

    console.log("✅ Game session created successfully");
    console.log("   Session ID:", responseData.id);
    console.log("   User ID (in response):", responseData.userId);
    console.log("   Score:", `${responseData.score}/${responseData.maxScore} (${responseData.scorePercentage}%)`);
    
    // Step 4: Verify the session was created with correct user_id
    console.log("\nStep 4: Verifying session in database...");
    const sessions = await sql`
      SELECT id, user_id, game_type, score, max_score
      FROM game_sessions
      WHERE id = ${responseData.id}::uuid
    `;
    
    if (sessions.length === 0) {
      console.error("❌ Session not found in database");
      process.exit(1);
    }
    
    const dbSession = sessions[0];
    console.log("✅ Session verified in database");
    console.log("   Session ID:", dbSession.id);
    console.log("   User ID (in DB):", dbSession.user_id);
    
    // Step 5: Verify the user_id matches internal student ID
    console.log("\nStep 5: Verifying user ID mapping...");
    if (dbSession.user_id === student.id) {
      console.log("✅ User ID correctly mapped!");
      console.log("   DB user_id:", dbSession.user_id);
      console.log("   Expected (student.id):", student.id);
    } else {
      console.error("❌ User ID mismatch!");
      console.error("   DB user_id:", dbSession.user_id);
      console.error("   Expected (student.id):", student.id);
      console.error("   Neon User ID:", neonUserId);
      process.exit(1);
    }
    
    // Step 6: Verify foreign key constraint is satisfied
    console.log("\nStep 6: Verifying foreign key constraint...");
    const fkCheck = await sql`
      SELECT gs.id, gs.user_id, s.id as student_id, s.email
      FROM game_sessions gs
      INNER JOIN students s ON gs.user_id = s.id
      WHERE gs.id = ${responseData.id}::uuid
    `;
    
    if (fkCheck.length === 0) {
      console.error("❌ Foreign key constraint violated!");
      console.error("   The game session's user_id does not reference a valid student");
      process.exit(1);
    }
    
    console.log("✅ Foreign key constraint satisfied!");
    console.log("   Game session references valid student");
    
    console.log("\n🎉 ALL TESTS PASSED!");
    console.log("\n✨ The user ID resolution fix is working correctly:");
    console.log("   1. JWT neon_user_id is correctly extracted");
    console.log("   2. Student is looked up by neon_user_id");
    console.log("   3. Internal student ID is used for database operations");
    console.log("   4. Foreign key constraint is satisfied");
    console.log("   5. No more 500 errors!");
    
  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error);
    process.exit(1);
  }
}

testUserIdResolution();
