# CLAUDE.md

## Contexto

Este repositório é o **AI Researcher**, projeto demonstrativo do módulo Capstone da Pós-Graduação em Engenharia AI-Native da UNIPDS.

**O código é material didático.** Ele será lido linha a linha por alunos e explicado em vídeo. Isso muda o critério de qualidade: clareza vence concisão, explícito vence esperto, e uma abstração só se justifica quando tem dois ou mais usos reais. Código correto porém difícil de narrar é código a ser reescrito.

O histórico de commits também é material — cada fase é uma tag Git, e o `git diff` entre tags é conteúdo de aula. Commits devem contar a história na ordem em que ela será ensinada.

**O que a aplicação faz:** chatbot consultor de investimentos. Consulta uma base vetorial de indicadores financeiros de 20 empresas da B3, avalia se o contexto recuperado é suficiente, busca na web quando não é, persiste o enriquecimento e responde com citação e data-base.

---

## Estado atual do repositório

Bloco 0 (fundação) está pronto: monorepo pnpm workspaces + Turborepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json`), tooling (`tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.editorconfig`) e `packages/contracts` (schema zod de `/health`).

Bloco B (corpus CVM) está pronto e fechado: `packages/corpus` coleta ITR/DFP direto de `dados.cvm.gov.br`, normaliza e gera os 80 documentos (`packages/corpus/data/documentos/{TICKER}.json`, 20 empresas × 4 trimestres) com o parágrafo determinístico já embutido. Rodar `pnpm collect` de novo busca os trimestres mais recentes disponíveis na hora — os arquivos em `data/documentos/` são o snapshot da última coleta, e são versionados. B.6 (conferência manual dos números contra os releases oficiais, via `pnpm --filter @hero/corpus run report [TICKER...]`) e B.7 (revisão do `evals/dataset.json`, 27 perguntas nos grupos A/B/C) foram concluídos por revisão humana — o dataset é considerado definitivo.

**Achado do D.5 sobre o corpus:** `packages/corpus/src/paragraphs/template.ts` só menciona `receita_liquida`, `lucro_liquido`, margem líquida (calculada) e `caixa_operacional` no parágrafo indexado — `lucro_bruto`, `ativo_total` e `patrimonio_liquido` são coletados e normalizados, mas nunca aparecem no texto que vira embedding. Isso apareceu ao validar o nó `grade` contra `evals/dataset.json`: duas perguntas sobre `patrimonio_liquido`/`ativo_total`, originalmente no grupo A, foram reclassificadas pro grupo B (B09/B10) porque de fato caem no fallback de busca web — o `grade` estava certo, o gap é no template. Decisão consciente de não expandir o template agora; se isso mudar, B.5 reabre e os 80 documentos + seed precisam rodar de novo.

Bloco A (fundação GCP) está pronto: projeto `ai-researcher-capstone` em `us-central1`, Artifact Registry, Cloud SQL Postgres 16 com `pgvector` habilitado, Secret Manager com `database-url`, Workload Identity Federation para o GitHub Actions (sem chave de service account) e Firebase Hosting inicializado. Detalhes, valores e a cronometragem (A.7 — ultrapassou os 20 min, virou pré-requisito assíncrono) estão em `infra/README.md`. Nenhuma credencial em arquivo local ou versionado — tudo vem do Secret Manager.

Bloco C (walking skeleton + deploy zero) está pronto: `apps/api` (Fastify, `GET /api/health` checando o Postgres de verdade via `pg`, com timeout e sem derrubar o processo se o banco cair) e `apps/web` (Angular 22, criado pela skill oficial `angular-new-app`, consumindo `/api/health` via `resource()`) rodam com `pnpm dev` (proxy local `/api` → `:3000`, sem CORS em lugar nenhum). `docker-compose.yml` na raiz sobe Postgres+pgvector efêmero, api e web via `infra/docker/*.Dockerfile` (build com `turbo prune --docker`). `.github/workflows/deploy.yml` builda/testa/lint, e em push pra `main` faz deploy da API no Cloud Run (via Cloud Build) e do Angular no Firebase Hosting — autenticado por WIF, sem nenhum secret no GitHub. `firebase.json` faz o rewrite `/api/**` → Cloud Run, mesma lógica do proxy local e do nginx do `docker-compose`. `scripts/capstone-check.ts` (`pnpm capstone:check --url <url>`) cobre os itens 1–3 do checklist (endpoint público, deploy automatizado, segredos protegidos); os demais itens chegam com os blocos que os implementam.

Bloco D (grafo do agente) está pronto e fechado: `packages/agent` monta o grafo via LangGraph.js (`buildGraph` em `src/graph.ts`) — `retrieve → grade → [suficiente | guard cortou] → answer`, com fallback pra `webSearch → retrieve` quando o contexto é insuficiente, limitado a `MAX_ITERATIONS = 2`. Cada nó recebe suas dependências de LLM/rede por parâmetro, nunca importa cliente global, e é testável com fake, sem chamada real. O corpus CVM (`documentos`) e o enriquecimento web (`documentos_web`, com TTL aplicado na leitura, não por job de limpeza) moram em tabelas separadas; `buscarDocumentosSimilares` consulta as duas e combina por distância. O nó `answer` garante citação (fonte + data-base, deduplicada por `sourceUrl`) e filtra linguagem recomendatória por código antes de devolver a resposta — não só por instrução de prompt, porque instrução de prompt não é garantia; é esse filtro que sustenta o teste de guardrail que a seção de domínio deste arquivo exige. `POST /api/chat` (`apps/api/src/routes/chat.ts`) expõe o grafo via streaming SSE, um evento por nó, com `Cache-Control: no-cache, no-transform` pra não bufferizar no Cloud Run. Modelos vêm de `MODEL_GRADE`/`MODEL_ANSWER`/`MODEL_EMBEDDING`, nunca hardcoded (`packages/agent/src/llm.ts`, `embeddings.ts`).

**Pendência que o D não fechou:** `SERPER_API_KEY`/`GOOGLE_CUSTOM_SEARCH_API_KEY`/`GOOGLE_CUSTOM_SEARCH_CX` ainda não existem no Secret Manager nem são injetadas pelo workflow de deploy. `criarGraphPadrao()` em `apps/api/src/app.ts` só constrói o grafo real no primeiro `POST /chat` (não no boot do processo), então o Cloud Run sobe e `/health` responde normal — mas `/chat` falha com um evento SSE de erro até essas variáveis serem configuradas. Confirmado com um servidor local de verdade, não só em teste com fake. Existe um segundo bug independente que também derrubava `/chat`, já corrigido no F.3: `gemini-3.5-flash-lite`/`gemini-3.6-flash` só respondiam em `location: "global"` na Vertex AI, e o código usava `us-central1` como default — ver `infra/README.md`.

Bloco E (qualidade, resiliência e MCP) está fechado, com uma ressalva documentada abaixo (E.11): cobertura de teste no parser/seleção de conta do coletor CVM (E.1; E.2 e E.3 já tinham vindo prontos do Bloco D — teste de roteamento e de guardrail já existiam), fixtures de busca web + modo `DEMO=true` sem rede (E.4), timeout/retry/circuit breaker no `SearchProvider` (E.5), degradação graciosa de ponta a ponta quando a busca cai (E.6), erros padronizados em `application/problem+json` (E.7), `packages/mcp-server` com a tool `perguntar` nos dois transportes — stdio (`src/stdio.ts`, para `claude mcp add`) e Streamable HTTP, tanto standalone (`src/http.ts`) quanto como gateway em `/api/mcp` dentro do `apps/api` (E.8–E.10) — e três itens novos no `capstone:check` (E.12): testes no CI, degradação graciosa e guardrail contra a URL de produção.

**E.11 bloqueado, não pulado:** "CI como required check" pede branch protection no GitHub, mas o repositório é privado numa conta no plano Free — `gh api .../branches/main/protection` devolve 403 pedindo upgrade pra GitHub Pro/Team (ou tornar o repo público). Isso é uma restrição de plano, não uma decisão de código; não vai ser contornado sem uma decisão do dono do repositório sobre billing ou visibilidade. O que já existe cobre o risco principal: `.github/workflows/deploy.yml` roda `test` em todo PR e o job `deploy` só executa se `test` passar (`needs: test`) — código quebrado não chega ao Cloud Run mesmo sem a trava formal de branch protection no merge. `pnpm capstone:check` (item 4) checa as duas partes honestamente e reporta a segunda como indisponível, em vez de mascarar como sucesso.

`evals/runner` ainda não existe — não está atribuído a nenhum bloco na quebra de tarefas atual (`docs/hero-project-tarefas.md`), só é mencionado na seção de Estrutura deste arquivo como parte do estado-alvo.

Bloco F (frontend) está pronto e fechado: F.1–F.7 completos. O protótipo do F.1 foi feito no **Claude Design** (`claude.ai/design`), não no Google Stitch originalmente previsto no plano — trocado por decisão do dono do projeto, já refletido em `docs/hero-project-plano.md` e `docs/hero-project-tarefas.md`. O export está versionado em `docs/design/prototype/`: `ai-researcher-chat.dc.html` é a versão canônica (paleta própria extraída da página da UNIPDS — fundo quase-preto, accent ciano, único botão em lima), `ai-researcher-chat-nocturne.dc.html` é uma variante alternativa com a skin de um design system genérico que existia no mesmo projeto do Claude Design, mantida só como referência. Os arquivos `.dc.html` são o formato de export da ferramenta — dependem de um runtime (`support.js` + `window.React` injetado pelo preview) que só existe dentro do Claude Design, não abrem como HTML estático fora dela. F.2 (skill `frontend-design`, em `.claude/skills/`) traduz os tokens e os padrões de componente do protótipo canônico em regras — inclui a decisão de domínio de nunca usar verde/vermelho em dado financeiro ou estado do pipeline, pra não sugerir compra/venda.

F.3 (chat com streaming) implementou `apps/web/src/app/chat/` (Chat, ChatMessageComponent), `state/chat-store.ts` e `api/chat.service.ts`. `POST /api/chat` não usa `EventSource` (não suporta POST) — `ChatService` lê o `ReadableStream` da `fetch` e parseia os frames SSE manualmente. O grafo emite um evento por nó, não por token — o texto final do nó `answer` chega inteiro de uma vez; o efeito "token a token" é só client-side, revelado palavra por palavra por um timer em `ChatStore`. Isso superou o placeholder de `/api/health` que ocupava `app.html` desde o walking skeleton do Bloco C — `HealthService` foi removido do frontend porque nada mais o usava; o endpoint continua coberto pelos testes de `apps/api` e pelo `capstone:check`, que o consultam direto por HTTP. Testado de ponta a ponta num Chrome de verdade (golden path e degradação graciosa) contra um servidor fake, e via curl contra o backend real. O backend real, com `DEMO=true` e a base local seedada, respondeu ao `retrieve` normalmente e falhou no `grade` com **404 do Vertex AI** em `gemini-3.5-flash-lite` ("model was not found or your project does not have access") — anterior ao F.3, não introduzido por ele. Raiz encontrada e corrigida: esses dois modelos só respondem em `location: "global"` nesse projeto, não em `us-central1` (o default anterior de `packages/agent/src/llm.ts`). Provavelmente estava quebrado em produção desde o Bloco D — `GOOGLE_CLOUD_LOCATION` nunca foi configurada em nenhum ambiente. Depois da correção, `retrieve → grade → answer` completo foi confirmado com curl contra Postgres e Vertex AI reais.

F.4 (citações clicáveis com data-base) lida com uma divergência entre o protótipo e o formato real: o `answerText` não marca posição de citação inline no meio da frase, ele termina com um bloco `Fontes:\n- rótulo: url` (`formatarCitacoes`, um item por documento deduplicado). `state/citation.ts` (`parseAnswer`) separa o corpo do bloco de fontes — só o corpo é revelado palavra a palavra; as citações da mensagem aparecem de uma vez quando ela termina, como pílulas clicáveis abaixo do texto, reaproveitando o padrão de painel inline (Data-base/Origem/link) já documentado na skill `frontend-design`. Confirmado contra o backend real que o formato de `answerText` bate exatamente com o que `parseAnswer` espera.

F.5 (painel de estado do grafo em tempo real) esbarrou numa limitação estrutural do stream: `POST /api/chat` só emite um evento por nó *concluído* (ver `apps/api/src/routes/chat.ts`), nunca "nó iniciado" — então "tempo real" com o nó ativo destacado exige prever a próxima etapa a partir da que acabou de chegar. `state/graph-store.ts` faz essa previsão (retrieve→grade sempre; grade→webSearch ou answer pelo `sufficient` e por uma contagem local de iterações que espelha `MAX_ITERATIONS` de `packages/agent/src/graph.ts`, não importado no frontend pra não levar LangGraph/Vertex AI/pg pro bundle do browser; webSearch→retrieve sempre) e modela as etapas como uma lista que cresce a cada passagem por um nó, não um mapa fixo de 4 posições — isso é o que garante não colapsar o loop (`angular-component` skill), com `Retrieve`/`Grade` repetidos ganhando `· iteração N`. `ChatStore` encaminha cada evento do stream pro `GraphStore` na mesma iteração do fetch, sem duplicar a chamada de rede. Testado num Chrome de verdade com um servidor fake simulando contexto insuficiente na primeira volta — o histórico completo (retrieve → grade → webSearch → retrieve · iteração 2 → grade · iteração 2 → answer) ficou visível, com duração e banner de fallback corretos.

F.6 (disclaimer regulatório persistente) é a faixa fixa entre o header e o corpo do chat em `chat.html`, renderizada incondicionalmente — não atrás de nenhum `@if`, então não some durante o streaming nem depende de interação. Sem modal, sem botão de fechar.

F.7 (Playwright, caminho feliz, rodando no CI) esbarrou num limite real do modo demo: "sem rede" (E.4) até aqui só cobria a busca web — `retrieve` ainda chamava a Vertex AI de verdade pra gerar o embedding da pergunta, e `grade`/`answer` sempre chamavam a Vertex AI de verdade. Sem GCP nem Postgres no runner do GitHub Actions, isso bloquearia o E2E de largada. `DEMO=true` foi estendido pra cobrir o grafo inteiro: `criarEmbeddings()` (`embeddings.ts`) devolve zeros (o valor não importa — `db/retrieve-demo.ts` também é fixture e ignora o embedding, sempre devolvendo o mesmo documento real da Vale 3T25 congelado do corpus), e `llm.ts`/`llm-demo.ts` fazem o mesmo pra grade (sempre suficiente) e answer (resposta fixa). O seed nunca roda em modo demo — ganhou `criarEmbeddingsReal()` separado, que isola o `embedDocuments()` em lote que só ele usa. Com isso, `node dist/index.js` com `DEMO=true` e nada mais roda `/api/chat` de ponta a ponta sem Postgres nem credencial de GCP — confirmado com curl antes de escrever o teste.

`e2e/chat-happy-path.spec.ts` (`apps/web`) sobe os dois processos reais via `playwright.config.ts` (`webServer`) e cobre a jornada completa: disclaimer sempre visível, pergunta enviada, resposta em streaming com citação (data-base, origem, link), painel do grafo concluindo sem passar por `webSearch`. O target `e2e` que `ng add playwright-ng-schematics` criou em `angular.json` foi removido — ele só sabe subir o dev server do Angular, e brigava pela porta 4200 com o `webServer` do Playwright, que já sobe os dois servidores (api + web) sozinho; `apps/web/package.json` chama `playwright test` direto. `angular.json` também ganhou `proxyConfig` no target `serve` (antes só vinha do flag `--proxy-config` nos scripts `dev`/`start`, que o dev server iniciado pelo Playwright não usa). `.github/workflows/deploy.yml` instala o Chromium do Playwright e roda `pnpm test:e2e` no job `test`, então `deploy` (que depende de `test`) também fica bloqueado por regressão E2E.

Isso fecha o Bloco F inteiro.

Bloco G (observabilidade e produção) está em andamento: G.1 pronto. `packages/agent/src/observability/langfuse.ts` instrumenta o grafo com `@langfuse/langchain` (`CallbackHandler`) + `@langfuse/otel` (`LangfuseSpanProcessor` registrado num `NodeTracerProvider`) — **não** `langfuse-langchain` (pacote sem escopo): esse é a geração legada v3 do SDK e exige a dependência `langchain` inteira como peer, que este projeto nunca teve (só `@langchain/core` + pacotes específicos). `registrarLangfuseTracing()` roda uma vez no boot de cada processo que pode invocar o grafo (`apps/api/src/index.ts`, `packages/mcp-server/src/stdio.ts` e `http.ts`); `criarLangfuseCallbacks()` é passado em todo `graph.stream()`/`graph.invoke()` (rota `/chat`, gateway `/api/mcp`, tool `perguntar` standalone). As duas funções são no-op sem `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` — trace desligado não impede nada de subir, mesmo espírito do `SERPER_API_KEY` pendente. Confirmado com credenciais falsas contra um host inexistente que uma exportação que falha não derruba a resposta nem trava o processo (export OTLP é assíncrono, best-effort).

**Pendência do G.1:** `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` ainda não existem — o dono do projeto ainda não criou a conta no Langfuse. Não estão no Secret Manager nem no `deploy.yml`; isso só entra depois que a conta existir e as chaves forem geradas. Até lá, `/chat` em produção funciona normal (guard já testado), só sem trace.

O restante deste arquivo — Stack, Estrutura, Comandos — descreve o **estado-alvo** completo do projeto, não necessariamente o estado atual em todo detalhe.

**Achado do Bloco B que vale saber antes de mexer no coletor:** o código de conta padronizado da CVM (`CD_CONTA`) não é estável entre setores — bancos têm uma árvore de DRE/BPP diferente da industrial, e até dois bancos entre si divergem na posição do lucro líquido. `packages/corpus/src/collect/select-quarters.ts` busca `lucro_liquido` e `patrimonio_liquido` por texto de `DS_CONTA` (com `ST_CONTA_FIXA=S`) por causa disso — não volte a usar código fixo pra esses dois campos sem reler o comentário no topo do arquivo.

O plano de execução completo (ementa, arquitetura, cronograma por tag Git, checklist do `capstone:check`) está em `docs/hero-project-plano.md`. A quebra em tarefas por bloco, com a ordem de dependência entre elas, está em `docs/hero-project-tarefas.md` — comece por lá para saber o que fazer a seguir.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| API | Fastify + TypeScript |
| Orquestração | LangGraph.js |
| Frontend | Angular 22 (standalone, signals) |
| Banco | Postgres + pgvector (Cloud SQL) |
| LLM e embeddings | Vertex AI via LangChain.js |
| Busca web | Custom Search / Serper, atrás de interface |
| Tools | MCP (stdio + Streamable HTTP) |
| Testes | Vitest + Playwright |
| Observabilidade | Langfuse, Prometheus, Grafana Cloud |
| Deploy | Cloud Run + Firebase Hosting, via GitHub Actions |

---

## Estrutura

```
apps/
  api/            Fastify, rotas, bootstrap
  web/            Angular
packages/
  agent/          grafo, nós, prompts, providers
  mcp-server/     registro das tools
  contracts/      schemas zod compartilhados
  corpus/         coleta CVM, normalização, geração de parágrafos
infra/            Dockerfile, workflows, IaC
evals/            dataset de perguntas e runner
scripts/          capstone:check, seed, destroy
```

Regra de dependência: `apps/*` pode importar `packages/*`; `packages/*` nunca importa `apps/*`. `contracts` não importa ninguém.

---

## Comandos

```bash
pnpm dev              # api + web em watch
pnpm build            # build de tudo
pnpm test             # unitários
pnpm test:e2e         # Playwright
pnpm lint             # ESLint + Prettier
pnpm collect          # coleta CVM — só na preparação do material
pnpm seed             # popula pgvector a partir dos JSONs versionados
pnpm capstone:check   # verificações de produção
```

---

## Regras de trabalho

**Pergunte antes de:**
- Instalar qualquer dependência nova.
- Criar uma abstração, interface ou camada que ainda não tem dois usos concretos.
- Alterar o schema do banco ou os schemas em `contracts`.
- Mudar configuração de deploy, workflow ou infraestrutura.
- Reorganizar pastas ou mover arquivos entre pacotes.

**Nunca:**
- Escrever segredo, chave ou connection string em arquivo versionado. Tudo vem de variável de ambiente, e em produção do Secret Manager.
- Commitar os ZIPs ou CSVs brutos da CVM. Apenas os JSONs normalizados são versionados.
- Usar LLM para gerar os parágrafos do corpus. São determinísticos, por template.
- Adicionar `any` sem comentário justificando. `unknown` com narrowing é preferível.
- Escrever teste que depende de rede. Use fixtures ou fakes.

---

## Convenções

**TypeScript**
- `strict: true`. Sem `any` implícito.
- Validação de entrada com zod na fronteira (rota HTTP, tool MCP, leitura de arquivo). Dentro do domínio, confie nos tipos.
- Erros de domínio são classes nomeadas, não strings. A API responde em `application/problem+json`.

**Nomes**
- Arquivos em `kebab-case`. Tipos e classes em `PascalCase`. Funções e variáveis em `camelCase`.
- Nós do grafo têm nome de verbo: `retrieve`, `grade`, `webSearch`, `answer`.

**Testes**
- Unitário para tudo que é determinístico: normalizador, gerador de parágrafos, chunker, parser.
- Comportamento do grafo é testado com LLM fake, nunca com chamada real.
- Um teste de guardrail é obrigatório e não pode ser removido.

**Commits**
- Mensagem no imperativo, em português, sem prefixo convencional.
- Um commit resolve uma coisa. Se a mensagem precisa de "e", provavelmente são dois commits.

---

## Domínio: restrição regulatória

A consultoria de valores mobiliários é atividade regulada pela CVM. **O sistema informa, nunca recomenda.**

Na prática:
- O prompt do nó `answer` proíbe sugestão de compra, venda ou manutenção de posição.
- Toda resposta cita a fonte e o período do dado.
- Existe um teste automatizado que envia "devo comprar X?" e verifica ausência de linguagem recomendatória. Se ele quebrar, o comportamento é o problema — não o teste.
- A interface exibe disclaimer permanente.

---

## O corpus

Fonte única: CVM Dados Abertos, formulários ITR e DFP. 20 empresas da B3, últimos 4 trimestres.

Indicadores extraídos: `receita_liquida`, `lucro_bruto`, `lucro_liquido`, `ativo_total`, `patrimonio_liquido`, `caixa_operacional`. A CVM publica em milhares de reais — a conversão acontece na normalização, uma única vez.

Cada empresa e trimestre vira **um parágrafo autocontido**, gerado por template determinístico, indexado como um chunk sem fragmentação.

Metadados obrigatórios em todo documento: `ticker`, `company_name`, `setor`, `period`, `period_end`, `source_url`, `fetched_at`.

O corpus contém apenas números. Perguntas qualitativas caem no fallback para busca web — isso é intencional e é o que a aula demonstra.

---

## Modelos

**Regra: apenas modelos estáveis.** Modelos em preview são descontinuados com duas semanas de aviso — inaceitável para material gravado que fica no ar por meses. A família Gemini 2.5 está em processo de aposentadoria e não entra no projeto.

| Papel | Modelo | Por quê |
|---|---|---|
| Nó `grade` | `gemini-3.5-flash-lite` | Classificação com saída estruturada. Alto volume, baixa complexidade — é onde o custo se multiplica pelo loop |
| Nó `answer` | `gemini-3.6-flash` | Equilíbrio entre velocidade e qualidade. Precisa acertar citação e respeitar o guardrail |
| Embeddings | `gemini-embedding-001` | Estável e adequado a RAG. O `gemini-embedding-2-preview` é multimodal, mas preview |

**Nome de modelo nunca é hardcoded.** Cada papel tem sua própria variável de ambiente:

```
MODEL_GRADE=gemini-3.5-flash-lite
MODEL_ANSWER=gemini-3.6-flash
MODEL_EMBEDDING=gemini-embedding-001
```

Duas razões: o material sobrevive à troca de modelo sem regravação, e a comparação de custo por nó — visível no trace do Langfuse — é conteúdo da Unidade 5.

Trocar o modelo de embedding invalida o índice inteiro. Se acontecer, o `pnpm seed` precisa rodar de novo do zero.

**Nota:** o Vertex AI vem sendo renomeado para Gemini Enterprise Agent Platform. As URLs da documentação mudaram; a API permanece a mesma.

---

## Skills

O repositório usa duas origens de skills, e a distinção é intencional — ela é parte do conteúdo da Unidade 1.

**Oficiais do Angular**, mantidas pelo time do framework e atualizadas a cada release:

```bash
npx skills add https://github.com/angular/skills
```

- `angular-developer` — geração de código e orientação arquitetural: componentes, serviços, reatividade (signals, `linkedSignal`, `resource`), formulários, injeção de dependência, roteamento, SSR, acessibilidade, animações, estilo, testes e CLI.
- `angular-new-app` — criação de aplicação nova via Angular CLI.

**Do repositório**, em `.claude/skills/`, cobrindo apenas o que é específico deste projeto:

- `fastify-route` — validação, problem+json, SSE.
- `langgraph-node` — assinatura de nó, estado, arestas condicionais, testabilidade.
- `angular-component` — store, consumo de SSE, painel do grafo, disclaimer.
- `frontend-design` — tokens de cor/tipografia/forma e fidelidade ao protótipo do F.1.

Regra de precedência: em conflito entre uma skill oficial e uma do repositório sobre idioma do framework, **a oficial vence**. Skills próprias descrevem decisões deste projeto, não regras da biblioteca.

---

## Observação sobre versões

As versões de Angular, LangGraph.js e dos modelos do Vertex AI mudam com frequência. Ao encontrar divergência entre este arquivo e a API real da biblioteca, siga a biblioteca e avise, em vez de forçar o padrão descrito aqui.
