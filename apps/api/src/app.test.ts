import { describe, expect, it } from 'vitest';
import { build } from './app.js';

const documentoFake = {
  id: '1',
  ticker: 'ABEV',
  companyName: 'Ambev S.A.',
  setor: 'Bebidas e Fumo',
  period: '2T25',
  periodEnd: '2025-06-30',
  paragraph: 'No 2T25, a Ambev S.A. reportou receita líquida de R$ 20,1 bilhões.',
  sourceUrl: 'https://dados.cvm.gov.br/...',
  fetchedAt: new Date('2026-08-08T02:19:40.760Z'),
  distance: 0.08,
};

describe('GET /api/debug/retrieve', () => {
  it('não registra a rota quando DEBUG_ROUTES está desligada (default)', async () => {
    const app = build({ checkDatabase: async () => true });

    const response = await app.inject({ method: 'GET', url: '/api/debug/retrieve?question=x' });

    expect(response.statusCode).toBe(404);
  });

  it('devolve os documentos do buscar quando a flag está ligada', async () => {
    const app = build({
      checkDatabase: async () => true,
      debugRoutes: true,
      embeddings: { embedQuery: async () => [0.1, 0.2] },
      buscar: async () => [documentoFake],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/debug/retrieve?question=Qual+a+receita+da+Ambev%3F',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      documents: [{ ...documentoFake, fetchedAt: documentoFake.fetchedAt.toISOString() }],
    });
  });

  it('rejeita question ausente com problem+json de erro de validação', async () => {
    const app = build({
      checkDatabase: async () => true,
      debugRoutes: true,
      embeddings: { embedQuery: async () => [0.1] },
      buscar: async () => [],
    });

    const response = await app.inject({ method: 'GET', url: '/api/debug/retrieve' });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(response.json()).toMatchObject({
      title: 'Entrada inválida',
      status: 400,
    });
  });
});

describe('GET /api/health', () => {
  it('responde ok quando o banco está saudável', async () => {
    const app = build({ checkDatabase: async () => true });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'ok' });
  });

  it('responde degraded (mas HTTP 200) quando o banco falha — falha de banco não derruba o serviço', async () => {
    const app = build({ checkDatabase: async () => false });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'degraded', database: 'error' });
  });
});
