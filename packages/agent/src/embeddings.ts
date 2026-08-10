import { VertexAIEmbeddings } from '@langchain/google-vertexai';

import { EMBEDDING_DIMENSIONS } from './db/schema.js';
import type { EmbeddingsClient } from './nodes/retrieve.js';

const PROJECT_ID = 'ai-researcher-capstone';

// DEMO=true não chama a Vertex AI — o vetor devolvido não importa porque em modo demo
// buscar() também é uma fixture (ver db/retrieve-demo.ts) que ignora o embedding recebido.
function criarEmbeddingsDemo(): EmbeddingsClient {
  return {
    async embedQuery() {
      return new Array(EMBEDDING_DIMENSIONS).fill(0);
    },
  };
}

// Instância concreta, com embedDocuments() em lote — usada pelo seed (seed/run.ts), que
// nunca roda em modo demo: semear o banco com vetores fake não faz sentido. O grafo usa
// criarEmbeddings() abaixo, que só precisa de embedQuery() e é DEMO-aware.
export function criarEmbeddingsReal(): VertexAIEmbeddings {
  return new VertexAIEmbeddings({
    model: process.env.MODEL_EMBEDDING ?? 'gemini-embedding-001',
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    dimensions: EMBEDDING_DIMENSIONS,
    // A Vertex AI só aceita OAuth2/ADC, nunca API key — mas o @langchain/google-vertexai
    // usa GOOGLE_API_KEY do ambiente se existir, mesmo pra Vertex, e a Predict API
    // rejeita API key com 401. String vazia é falsy e força o fallback pra ADC.
    // Ver infra/README.md — "gcloud auth application-default login".
    apiKey: '',
    // GOOGLE_CLOUD_PROJECT no ambiente é ambíguo (qualquer projeto Gemini/AI Studio
    // anterior do desenvolvedor pode tê-lo setado) — usamos o projeto fixo do curso.
    authOptions: { projectId: PROJECT_ID },
  });
}

export function criarEmbeddings(): EmbeddingsClient {
  if (process.env.DEMO === 'true') return criarEmbeddingsDemo();
  return criarEmbeddingsReal();
}
