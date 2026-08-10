import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { criarServidor } from './server.js';

const server = criarServidor();
const transport = new StdioServerTransport();
await server.connect(transport);
