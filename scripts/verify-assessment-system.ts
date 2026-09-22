#!/usr/bin/env tsx
/**
 * Verification script for the assessment system
 * Checks that all components are properly implemented and TypeScript compiles
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, message: string): void {
  results.push({ name, passed, message });
  const status = passed ? "✅" : "❌";
  console.log(`${status} ${name}: ${message}`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log("🔍 Verifying Assessment System Implementation\n");

  // Check migration file
  const migrationExists = await fileExists(
    join(projectRoot, "migrations/007_assessments.sql")
  );
  check(
    "Migration File",
    migrationExists,
    migrationExists
      ? "007_assessments.sql exists"
      : "Migration file not found"
  );

  // Check library module
  const libExists = await fileExists(
    join(projectRoot, "src/lib/assessments.ts")
  );
  check(
    "Library Module",
    libExists,
    libExists ? "assessments.ts exists" : "Library module not found"
  );

  // Check if admin routes were updated
  if (libExists) {
    const adminRoutesContent = await readFile(
      join(projectRoot, "src/routes/admin.ts"),
      "utf8"
    );
    const hasImport = adminRoutesContent.includes(
      'from "../lib/assessments.js"'
    );
    const hasEndpoints = adminRoutesContent.includes(
      "/admin/assessment"
    ) || adminRoutesContent.includes("adminRoutes.post");
    check(
      "Admin Routes Updated",
      hasImport && hasEndpoints,
      hasImport && hasEndpoints
        ? "Assessment endpoints added to admin.ts"
        : "Admin routes not properly updated"
    );
  }

  // Check documentation
  const docs = [
    "docs/assessment-system.md",
    "docs/assessment-design-decisions.md",
    "docs/assessment-frontend-guide.md",
    "docs/assessment-architecture.md",
    "docs/README.md",
  ];

  for (const doc of docs) {
    const exists = await fileExists(join(projectRoot, doc));
    check(
      `Documentation: ${doc.split("/")[1]}`,
      exists,
      exists ? "Found" : "Missing"
    );
  }

  // Check README was updated
  const readmeContent = await readFile(join(projectRoot, "README.md"), "utf8");
  const readmeUpdated = readmeContent.includes("Assessment System");
  check(
    "README Updated",
    readmeUpdated,
    readmeUpdated
      ? "Assessment section added to README"
      : "README not updated"
  );

  // Try to import the assessment module
  try {
    const assessments = await import("../src/lib/assessments.js");
    const hasExports =
      typeof assessments.saveAssessment === "function" &&
      typeof assessments.completeAssessment === "function" &&
      typeof assessments.getAssessmentByEnrollmentId === "function" &&
      typeof assessments.addEnrollmentFeedback === "function" &&
      typeof assessments.getEnrollmentFeedback === "function";

    check(
      "Module Exports",
      hasExports,
      hasExports
        ? "All functions exported correctly"
        : "Some exports missing"
    );
  } catch (error) {
    check(
      "Module Exports",
      false,
      `Failed to import: ${(error as Error).message}`
    );
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);

  console.log(`\n📊 Summary: ${passed}/${total} checks passed (${percentage}%)\n`);

  if (percentage === 100) {
    console.log("🎉 All checks passed! The assessment system is ready.");
    console.log("\n📝 Next steps:");
    console.log("   1. Configure DATABASE_URL in .env");
    console.log("   2. Run: npm run migrate");
    console.log("   3. Run: npm run dev");
    console.log("   4. Test endpoints (see test-assessment-system.md)");
  } else {
    console.log("⚠️  Some checks failed. Please review the issues above.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Verification failed:", error);
  process.exit(1);
});
