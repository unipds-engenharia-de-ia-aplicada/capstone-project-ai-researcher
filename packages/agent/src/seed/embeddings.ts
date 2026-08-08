import { VertexAIEmbeddings } from '@langchain/google-vertexai';

import { EMBEDDING_DIMENSIONS } from '../db/schema.js';

export function criarEmbeddings(): VertexAIEmbeddings {
  return new VertexAIEmbeddings({
    model: process.env.MODEL_EMBEDDING ?? 'gemini-embedding-001',
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    dimensions: EMBEDDING_DIMENSIONS,
  });
}
