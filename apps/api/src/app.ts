import Fastify from 'fastify';
import {
  buildGraph,
  buscarDocumentosSimilares,
  criarAnswerLlm,
  criarBuscarPagina,
  criarEmbeddings,
  criarGradeLlm,
  criarSearchProvider,
  db,
  inserirDocumentoWeb,
} from '@hero/agent';
import type { Buscar, EmbeddingsClient } from '@hero/agent';
import healthRoute from './routes/health.js';
import debugRetrieveRoute from './routes/debug-retrieve.js';
import chatRoute from './routes/chat.js';
import type { GraphLike } from './routes/chat.js';
import { checkDatabase as defaultCheckDatabase } from './db.js';

// Constrói o grafo real só no primeiro POST /chat, não na inicialização do app — assim
// build() continua seguro em teste, sem exigir SERPER_API_KEY/GOOGLE_CUSTOM_SEARCH_* (a
// própria criarSearchProvider() lança erro síncrono se a variável faltar). Em produção o
// custo é só no primeiro request; os seguintes reusam a mesma instância.
function criarGraphPadrao(): GraphLike {
  let grafoReal: ReturnType<typeof buildGraph> | undefined;

  return {
    async stream(input) {
      grafoReal ??= buildGraph({
        embeddings: criarEmbeddings(),
        buscar: (embedding, k) => buscarDocumentosSimilares(db, embedding, k),
        gradeLlm: criarGradeLlm(),
        searchProvider: criarSearchProvider(),
        buscarPagina: criarBuscarPagina(),
        inserirDocumentoWeb: (linha) => inserirDocumentoWeb(db, linha),
        answerLlm: criarAnswerLlm(),
      });
      return grafoReal.stream(input);
    },
  };
}

export interface BuildOptions {
  checkDatabase?: () => Promise<boolean>;
  debugRoutes?: boolean;
  embeddings?: EmbeddingsClient;
  buscar?: Buscar;
  graph?: GraphLike;
}

export function build({
  checkDatabase = defaultCheckDatabase,
  debugRoutes = process.env.DEBUG_ROUTES === 'true',
  embeddings,
  buscar,
  graph,
}: BuildOptions = {}) {
  const app = Fastify({ logger: true });

  app.register(
    async (api) => {
      api.register(healthRoute, { checkDatabase });
      api.register(chatRoute, { graph: graph ?? criarGraphPadrao() });

      // Rota de debug: nunca sobe em produção — DEBUG_ROUTES não é setada no Cloud Run.
      if (debugRoutes) {
        api.register(debugRetrieveRoute, {
          embeddings: embeddings ?? criarEmbeddings(),
          buscar: buscar ?? ((embedding, k) => buscarDocumentosSimilares(db, embedding, k)),
        });
      }
    },
    { prefix: '/api' },
  );

  return app;
}
