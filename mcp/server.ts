#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { initDeckTool } from './tools/init.ts';
import { buildDeckTool } from './tools/build.ts';
import {
  startReviewTool,
  stopReviewTool,
  waitForCloseTool
} from './tools/review.ts';
import { getAnnotationsTool } from './tools/annotations.ts';
import { publishDeckTool } from './tools/publish.ts';

interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

const tools: ToolDef[] = [
  initDeckTool,
  buildDeckTool,
  startReviewTool,
  waitForCloseTool,
  getAnnotationsTool,
  stopReviewTool,
  publishDeckTool
];

async function main(): Promise<void> {
  const server = new Server(
    { name: 'deckmark', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find(t => t.name === req.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
        isError: true
      };
    }
    try {
      const result = await tool.handler((req.params.arguments ?? {}) as Record<string, unknown>);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `Error: ${(e as Error).message}` }],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
