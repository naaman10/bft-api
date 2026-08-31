import { getContentful } from "./contentful.js";

const CONTENT_TYPE = "content";
const PAGE_SIZE = 1000;

export type ContentItem = {
  name: string;
  entryId: string;
  type: string;
  subject: string;
  ageGroup: string;
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
  name?: string;
  type?: string;
  subject?: string;
  ageGroup?: string;
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
  fields: ContentFields;
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
