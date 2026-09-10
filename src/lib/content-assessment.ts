// Operates only on serialized Contentful content, never student progress.
export function redactAssessmentAnswers(value: unknown): unknown {
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
