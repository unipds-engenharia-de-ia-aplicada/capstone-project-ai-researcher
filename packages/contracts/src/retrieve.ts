import { z } from 'zod';

export const retrieveDebugQuerySchema = z.object({
  question: z.string().min(1),
  k: z.coerce.number().int().min(1).max(20).default(5),
});

export const retrievedDocumentSchema = z.object({
  id: z.string(),
  ticker: z.string(),
  companyName: z.string(),
  setor: z.string(),
  period: z.string(),
  periodEnd: z.string(),
  paragraph: z.string(),
  sourceUrl: z.string(),
  fetchedAt: z.string(),
  distance: z.number(),
});

export const retrieveDebugResponseSchema = z.object({
  documents: z.array(retrievedDocumentSchema),
});

export type RetrieveDebugQuery = z.infer<typeof retrieveDebugQuerySchema>;
export type RetrievedDocument = z.infer<typeof retrievedDocumentSchema>;
export type RetrieveDebugResponse = z.infer<typeof retrieveDebugResponseSchema>;
