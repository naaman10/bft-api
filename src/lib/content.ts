import type { EntryFieldTypes } from "contentful";
import { redactAssessmentAnswers } from "./content-assessment.js";
import { getContentful } from "./contentful.js";
import type { MarkingQuestion } from "./points.js";

const CONTENT_TYPE = "content";
const PAGE_SIZE = 1000;

export type ContentItem = {
  name: string;
  entryId: string;
  type: string;
  subject: string;
  ageGroup: string;
};

export type ContentEntry = {
  entryId: string;
  name: string;
  type: string;
  subject: string;
  ageGroup: string;
  stage: string;
  entryName: string;
  requiresAssessment: boolean;
  time?: number;
  fields: Record<string, unknown>;
};

export type ContentMarkingScheme = {
  contentId: string;
  contentName: string;
  requiresAssessment: boolean;
  questions: MarkingQuestion[];
};

export type ContentFilters = {
  type?: string;
  subject?: string;
  ageGroup?: string;
};

export type ContentList = {
  filters: {
    type: string[];
    subject: string[];
    ageGroup: string[];
  };
  items: ContentItem[];
};

type ContentFields = {
  requiresAssessment?: EntryFieldTypes.Boolean;
  time?: EntryFieldTypes.Integer;
  name?: string;
  type?: string;
  subject?: string;
  ageGroup?: string;
  stage?: string;
  entryName?: string;
};

type ContentSkeleton = {
  contentTypeId: "content";
  fields: ContentFields;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function matches(
  item: ContentItem,
  filters: ContentFilters,
  omit?: keyof ContentFilters
): boolean {
  if (omit !== "type" && filters.type && item.type !== filters.type) {
    return false;
  }
  if (omit !== "subject" && filters.subject && item.subject !== filters.subject) {
    return false;
  }
  if (
    omit !== "ageGroup" &&
    filters.ageGroup &&
    item.ageGroup !== filters.ageGroup
  ) {
    return false;
  }
  return true;
}

function mapEntry(entry: {
  sys: { id: string };
  fields: { name?: unknown; type?: unknown; subject?: unknown; ageGroup?: unknown };
}): ContentItem {
  return {
    name: asString(entry.fields.name),
    entryId: entry.sys.id,
    type: asString(entry.fields.type),
    subject: asString(entry.fields.subject),
    ageGroup: asString(entry.fields.ageGroup),
  };
}

export async function listContent(
  filters: ContentFilters
): Promise<ContentList> {
  const client = getContentful();
  const items: ContentItem[] = [];
  let skip = 0;
  let total = Number.POSITIVE_INFINITY;

  while (skip < total) {
    const page = await client.getEntries<ContentSkeleton>({
      content_type: CONTENT_TYPE,
      skip,
      limit: PAGE_SIZE,
      select: [
        "sys.id",
        "fields.name",
        "fields.type",
        "fields.subject",
        "fields.ageGroup",
      ],
    });

    total = page.total;
    for (const entry of page.items) {
      items.push(mapEntry(entry));
    }
    skip += PAGE_SIZE;
  }

  return {
    filters: {
      type: uniqueSorted(
        items.filter((item) => matches(item, filters, "type")).map((item) => item.type)
      ),
      subject: uniqueSorted(
        items
          .filter((item) => matches(item, filters, "subject"))
          .map((item) => item.subject)
      ),
      ageGroup: uniqueSorted(
        items
          .filter((item) => matches(item, filters, "ageGroup"))
          .map((item) => item.ageGroup)
      ),
    },
    items: items.filter((item) => matches(item, filters)),
  };
}

export async function getMissingContentIds(
  contentIds: string[]
): Promise<string[]> {
  if (contentIds.length === 0) {
    return [];
  }

  const client = getContentful();
  const page = await client.getEntries({
    content_type: CONTENT_TYPE,
    "sys.id[in]": contentIds,
    limit: contentIds.length,
    select: ["sys.id"],
  });
  const found = new Set(page.items.map((entry) => entry.sys.id));

  return contentIds.filter((id) => !found.has(id));
}

export async function getContentNamesByIds(
  contentIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  if (contentIds.length === 0) {
    return names;
  }

  const client = getContentful();
  const page = await client.getEntries<ContentSkeleton>({
    content_type: CONTENT_TYPE,
    "sys.id[in]": contentIds,
    limit: contentIds.length,
    select: ["sys.id", "fields.name"],
  });

  for (const entry of page.items) {
    names.set(entry.sys.id, asString(entry.fields.name));
  }

  return names;
}

export async function getContentItemsByIds(
  contentIds: string[]
): Promise<Map<string, ContentItem>> {
  const ids = [...new Set(contentIds.map((id) => id.trim()).filter(Boolean))];
  const items = new Map<string, ContentItem>();

  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const page = await getContentful().getEntries<ContentSkeleton>({
      content_type: CONTENT_TYPE,
      "sys.id[in]": batch,
      limit: batch.length,
      select: [
        "sys.id",
        "fields.name",
        "fields.type",
        "fields.subject",
        "fields.ageGroup",
      ],
    });

    for (const entry of page.items) {
      const item = mapEntry(entry);
      items.set(item.entryId, item);
    }
  }

  return items;
}

const KNOWN_FIELD_IDS = new Set([
  "name",
  "type",
  "subject",
  "ageGroup",
  "stage",
  "entryName",
]);

function toJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, seen));
  }

  if (typeof value !== "object") {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  const sys = record.sys;

  if (sys && typeof sys === "object") {
    const sysRecord = sys as {
      id?: string;
      type?: string;
      contentType?: { sys?: { id?: string } };
    };

    if (record.fields && typeof record.fields === "object") {
      const serializedFields = toJsonValue(record.fields, seen);
      return {
        entryId: sysRecord.id ?? null,
        type: sysRecord.type ?? null,
        contentType: sysRecord.contentType?.sys?.id ?? null,
        fields: serializedFields,
      };
    }
  }

  const out: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(record)) {
    if (typeof nested === "function") {
      continue;
    }

    const serialized = toJsonValue(nested, seen);

    if (serialized !== undefined) {
      out[key] = serialized;
    }
  }

  return out;
}

function collectMarkingQuestions(
  value: unknown,
  questions: MarkingQuestion[],
  seen = new WeakSet<object>()
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMarkingQuestions(item, questions, seen);
    }
    return;
  }

  if (!value || typeof value !== "object" || seen.has(value)) {
    return;
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  const sys = record.sys as
    | { id?: string; contentType?: { sys?: { id?: string } } }
    | undefined;
  const fields = record.fields as Record<string, unknown> | undefined;
  const contentType = sys?.contentType?.sys?.id;

  if (
    fields &&
    sys?.id &&
    (contentType === "question" || contentType === "questionMultipleChoice")
  ) {
    const points = fields.points;

    if (
      fields.answer !== undefined &&
      typeof points === "number" &&
      Number.isInteger(points) &&
      points > 0
    ) {
      questions.push({
        questionId: sys.id,
        correctAnswer: fields.answer,
        points,
      });
    }
    return;
  }

  for (const child of Object.values(fields ?? record)) {
    collectMarkingQuestions(child, questions, seen);
  }
}

export async function getContentMarkingScheme(
  entryId: string
): Promise<ContentMarkingScheme | null> {
  const id = entryId.trim();

  if (!id) {
    return null;
  }

  const client = getContentful();

  try {
    const entry = await client.getEntry<ContentSkeleton>(id, { include: 10 });

    if (entry.sys.contentType?.sys.id !== CONTENT_TYPE) {
      return null;
    }

    const questions: MarkingQuestion[] = [];
    const fields = entry.fields as unknown as Record<string, unknown>;
    collectMarkingQuestions(fields.sections, questions);

    return {
      contentId: entry.sys.id,
      contentName: asString(entry.fields.name) || entry.sys.id,
      requiresAssessment: entry.fields.requiresAssessment === true,
      questions,
    };
  } catch (error) {
    const notFound = (error as { sys?: { id?: string } }).sys?.id === "NotFound";
    const status = (error as { response?: { status?: number } }).response?.status;

    if (notFound || status === 404) {
      return null;
    }

    throw error;
  }
}

export async function getContentEntry(
  entryId: string
): Promise<ContentEntry | null> {
  const id = entryId.trim();

  if (!id) {
    return null;
  }

  const client = getContentful();

  try {
    const entry = await client.getEntry<ContentSkeleton>(id, { include: 2 });

    if (entry.sys.contentType?.sys.id !== CONTENT_TYPE) {
      return null;
    }

    const extraFields: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(entry.fields)) {
      if (KNOWN_FIELD_IDS.has(key)) {
        continue;
      }

      extraFields[key] = toJsonValue(value);
    }

    return {
      entryId: entry.sys.id,
      name: asString(entry.fields.name),
      type: asString(entry.fields.type),
      subject: asString(entry.fields.subject),
      ageGroup: asString(entry.fields.ageGroup),
      stage: asString(entry.fields.stage),
      entryName: asString(entry.fields.entryName),
      requiresAssessment: entry.fields.requiresAssessment === true,
      ...(typeof entry.fields.time === "number" && Number.isInteger(entry.fields.time)
        ? { time: entry.fields.time } : {}),
      // Correct answers are always server-only, including auto-marked content.
      fields: redactAssessmentAnswers(extraFields) as Record<string, unknown>,
    };
  } catch (error) {
    const status = (error as { sys?: { id?: string }; response?: { status?: number } })
      .sys?.id;
    const httpStatus = (error as { response?: { status?: number } }).response
      ?.status;

    if (status === "NotFound" || httpStatus === 404) {
      return null;
    }

    throw error;
  }
}
