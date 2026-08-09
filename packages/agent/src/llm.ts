import { ChatVertexAI } from '@langchain/google-vertexai';

import type { AnswerLlmClient } from './nodes/answer.js';
import type { GradeLlmClient } from './nodes/grade.js';

const PROJECT_ID = 'ai-researcher-capstone';

function criarChatModel(model: string): ChatVertexAI {
  return new ChatVertexAI({
    model,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    // Mesmo motivo do embeddings.ts: GOOGLE_API_KEY no ambiente quebra a autenticação da
    // Vertex AI, que só aceita OAuth2/ADC. Ver infra/README.md.
    apiKey: '',
    authOptions: { projectId: PROJECT_ID },
  });
}

// ChatVertexAI já implementa withStructuredOutput().invoke() nativamente — satisfaz
// GradeLlmClient sem adaptação.
export function criarGradeLlm(): GradeLlmClient {
  return criarChatModel(process.env.MODEL_GRADE ?? 'gemini-3.5-flash-lite');
}

// AnswerLlmClient espera invoke(): Promise<{ content: string }>, mas o content de
// ChatVertexAI é MessageContent (string | partes complexas) — normaliza aqui, uma vez,
// em vez de o nó answer ter que lidar com os dois formatos.
export function criarAnswerLlm(): AnswerLlmClient {
  const chatModel = criarChatModel(process.env.MODEL_ANSWER ?? 'gemini-3.6-flash');

  return {
    async invoke(prompt: string) {
      const resposta = await chatModel.invoke(prompt);
      const content =
        typeof resposta.content === 'string' ? resposta.content : String(resposta.content);
      return { content };
    },
  };
}
