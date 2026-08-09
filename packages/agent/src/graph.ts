import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type { RetrievedDoc } from './db/retrieve-similar.js';
import type { GradeLlmClient } from './nodes/grade.js';
import { makeGradeNode } from './nodes/grade.js';
import type { Buscar, EmbeddingsClient } from './nodes/retrieve.js';
import { makeRetrieveNode } from './nodes/retrieve.js';
import type { BuscarPagina, InserirDocumentoWeb } from './nodes/web-search.js';
import { makeWebSearchNode } from './nodes/web-search.js';
import type { SearchProvider } from './search/types.js';

// Acima disso, iterations >= MAX_ITERATIONS força a saída do loop mesmo com sufficient: false —
// é o guard contra laço infinito. A resposta com contexto parcial é responsabilidade do nó
// `answer` (D.9); aqui o grafo ainda termina em END, sem esse nó.
export const MAX_ITERATIONS = 2;

export const ResearchState = Annotation.Root({
  question: Annotation<string>,
  documents: Annotation<RetrievedDoc[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  sufficient: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  missingAspects: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  iterations: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),
});

export interface GraphDeps {
  embeddings: EmbeddingsClient;
  buscar: Buscar;
  gradeLlm: GradeLlmClient;
  searchProvider: SearchProvider;
  buscarPagina: BuscarPagina;
  inserirDocumentoWeb: InserirDocumentoWeb;
}

// A aresta condicional só decide a rota — quem produz sufficient/iterations é o nó grade.
function proximoNo(state: typeof ResearchState.State): 'webSearch' | typeof END {
  if (state.sufficient) return END;
  if (state.iterations >= MAX_ITERATIONS) return END;
  return 'webSearch';
}

export function buildGraph(deps: GraphDeps) {
  const retrieve = makeRetrieveNode(deps.embeddings, deps.buscar);
  const grade = makeGradeNode(deps.gradeLlm);
  const webSearch = makeWebSearchNode(
    deps.searchProvider,
    deps.embeddings,
    deps.buscarPagina,
    deps.inserirDocumentoWeb,
  );

  return new StateGraph(ResearchState)
    .addNode('retrieve', retrieve)
    .addNode('grade', grade)
    .addNode('webSearch', webSearch)
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'grade')
    .addConditionalEdges('grade', proximoNo)
    .addEdge('webSearch', 'retrieve')
    .compile();
}
