import Fastify from 'fastify';
import {
  buildGraph,
  buscarDocumentosSimilares,
  criarEmbeddings,
  criarGraphDepsPadrao,
  db,
} from '@hero/agent';
import type { Buscar, EmbeddingsClient } from '@hero/agent';
import { mcpHttpRoute } from '@hero/mcp-server';
import type { GraphLike as McpGraphLike } from '@hero/mcp-server';
import healthRoute from './routes/health.js';
import debugRetrieveRoute from './routes/debug-retrieve.js';
import chatRoute from './routes/chat.js';
import type { GraphLike as ChatGraphLike } from './routes/chat.js';
import { checkDatabase as defaultCheckDatabase } from './db.js';
import { errorHandler } from './error-handler.js';

// Constrói o grafo real só no primeiro uso (POST /chat ou tool perguntar via /api/mcp), não
// na inicialização do app — assim build() continua seguro em teste, sem exigir
// SERPER_API_KEY/GOOGLE_CUSTOM_SEARCH_* (a própria criarSearchProvider() lança erro síncrono
// se a variável faltar). Instância única compartilhada entre os dois pontos de entrada — evita
// duas instâncias de SearchProvider (e dois circuit breakers independentes) pra mesma API.
function criarObterGrafo(): () => ReturnType<typeof buildGraph> {
  let grafoReal: ReturnType<typeof buildGraph> | undefined;
  return () => (grafoReal ??= buildGraph(criarGraphDepsPadrao()));
}

export interface BuildOptions {
  checkDatabase?: () => Promise<boolean>;
  debugRoutes?: boolean;
  embeddings?: EmbeddingsClient;
  buscar?: Buscar;
  graph?: ChatGraphLike;
  mcpGraph?: McpGraphLike;
}

export function build({
  checkDatabase = defaultCheckDatabase,
  debugRoutes = process.env.DEBUG_ROUTES === 'true',
  embeddings,
  buscar,
  graph,
  mcpGraph,
}: BuildOptions = {}) {
  const app = Fastify({ logger: true });
  app.setErrorHandler(errorHandler);

  const obterGrafo = criarObterGrafo();

  app.register(
    async (api) => {
      api.register(healthRoute, { checkDatabase });
      api.register(chatRoute, {
        graph: graph ?? { stream: (input) => obterGrafo().stream(input) },
      });

      // Gateway MCP pro Angular (e qualquer outro cliente HTTP) — mesmas tools do transporte
      // stdio (packages/mcp-server), só o transporte muda. A rota já se chama /mcp dentro do
      // plugin (ver http-route.ts), então isso vira /api/mcp — sem prefixo extra aqui.
      // Mesmo grafo do /chat: ver comentário de criarObterGrafo.
      api.register(mcpHttpRoute, {
        graph: mcpGraph ?? { invoke: (input) => obterGrafo().invoke(input) },
      });

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
