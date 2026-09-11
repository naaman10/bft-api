import type { EnrollmentProgress } from "./progress.js";

export type MarkingQuestion = {
  questionId: string;
  correctAnswer: unknown;
  points: number;
};

export type PointAward = {
  questionId: string;
  pointsEarned: number;
  pointsAvailable: number;
};

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

export function answersMatch(actual: unknown, expected: unknown): boolean {
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

export function calculatePointAwards(
  progress: EnrollmentProgress,
  questions: MarkingQuestion[]
): PointAward[] {
  const awards: PointAward[] = [];

  for (const question of questions) {
    const item = progress.items[question.questionId];

    if (
      question.points <= 0 ||
      !Number.isInteger(question.points) ||
      item?.status !== "completed" ||
      item.answer === undefined ||
      !answersMatch(item.answer, question.correctAnswer)
    ) {
      continue;
    }

    awards.push({
      questionId: question.questionId,
      pointsEarned: question.points,
      pointsAvailable: question.points,
    });
  }

  return awards;
}
