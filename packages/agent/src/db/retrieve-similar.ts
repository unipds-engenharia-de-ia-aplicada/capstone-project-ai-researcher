import { cosineDistance, sql } from 'drizzle-orm';

import type { Database } from './client.js';
import { documentos } from './schema.js';

export interface RetrievedDoc {
  id: string;
  ticker: string;
  companyName: string;
  setor: string;
  period: string;
  periodEnd: string;
  paragraph: string;
  sourceUrl: string;
  fetchedAt: Date;
  distance: number;
}

export async function buscarDocumentosSimilares(
  db: Database,
  embedding: number[],
  k: number,
): Promise<RetrievedDoc[]> {
  const distance = sql<number>`${cosineDistance(documentos.embedding, embedding)}`;

  return db
    .select({
      id: documentos.id,
      ticker: documentos.ticker,
      companyName: documentos.companyName,
      setor: documentos.setor,
      period: documentos.period,
      periodEnd: documentos.periodEnd,
      paragraph: documentos.paragraph,
      sourceUrl: documentos.sourceUrl,
      fetchedAt: documentos.fetchedAt,
      distance,
    })
    .from(documentos)
    .orderBy(distance)
    .limit(k);
}
