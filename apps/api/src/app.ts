import Fastify from 'fastify';
import { buscarDocumentosSimilares, criarEmbeddings, db } from '@hero/agent';
import type { Buscar, EmbeddingsClient } from '@hero/agent';
import healthRoute from './routes/health.js';
import debugRetrieveRoute from './routes/debug-retrieve.js';
import { checkDatabase as defaultCheckDatabase } from './db.js';

export interface BuildOptions {
  checkDatabase?: () => Promise<boolean>;
  debugRoutes?: boolean;
  embeddings?: EmbeddingsClient;
  buscar?: Buscar;
}

export function build({
  checkDatabase = defaultCheckDatabase,
  debugRoutes = process.env.DEBUG_ROUTES === 'true',
  embeddings,
  buscar,
}: BuildOptions = {}) {
  const app = Fastify({ logger: true });

  app.register(
    async (api) => {
      api.register(healthRoute, { checkDatabase });

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
