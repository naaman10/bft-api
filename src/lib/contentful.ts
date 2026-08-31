import { createClient, type ContentfulClientApi } from "contentful";
import { env } from "../config/env.js";

let client: ContentfulClientApi<undefined> | undefined;

export function getContentful(): ContentfulClientApi<undefined> {
  if (!env.CONTENTFUL_SPACE_ID || !env.CONTENTFUL_ACCESS_TOKEN) {
    throw new Error(
      "Contentful is not configured. Set CONTENTFUL_SPACE_ID and CONTENTFUL_ACCESS_TOKEN."
    );
  }

  if (!client) {
    client = createClient({
      space: env.CONTENTFUL_SPACE_ID,
      accessToken: env.CONTENTFUL_ACCESS_TOKEN,
      environment: env.CONTENTFUL_ENVIRONMENT,
    });
  }

  return client;
}
