import type { FastifyPluginAsync } from 'fastify';

// Só o formato mínimo que a rota usa do Registry do prom-client — mesmo padrão de GraphLike
// em chat.ts: permite fake em teste sem trazer prom-client pra apps/api.
export interface MetricsRegistry {
  contentType: string;
  metrics(): Promise<string>;
}

export interface MetricsRouteOptions {
  registry: MetricsRegistry;
}

const metricsRoute: FastifyPluginAsync<MetricsRouteOptions> = async (app, { registry }) => {
  app.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
};

export default metricsRoute;
