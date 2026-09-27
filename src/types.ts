import type { AuthUser } from "./lib/auth.js";
import type { LearnEnrollment } from "./lib/enrollments.js";
import type { CompletedAssessment } from "./lib/assessments.js";
import type { Student } from "./lib/students.js";

export type AppEnv = {
  Variables: {
    user: AuthUser;
    student: Student;
  };
};

export type SessionResponse =
  | {
      authenticated: true;
      user: AuthUser;
      enrollments: LearnEnrollment[];
      totalPoints: number;
      targetPoints: number | null;
      completedAssessments: CompletedAssessment[];
      unreadNotificationCount: number;
    }
  | {
      authenticated: false;
      user: null;
      error: string;
    };
