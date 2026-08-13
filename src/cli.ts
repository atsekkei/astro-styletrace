#!/usr/bin/env node
import { SOURCE_ENDPOINT, OBSERVATION_ENDPOINT } from './session.js';

type CliOptions = {
  url: string;
  line: number | null;
  context: number | null;
};

const DEFAULT_URL = 'http://localhost:4321';

async function main(argv: string[]): Promise<number> {
  const command = argv[0] ?? 'help';
  const args = argv.slice(1);
  const options = parseOptions(args);

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(help());
    return 0;
  }

  if (command === 'observation') {
    process.stdout.write(await readObservation(options.url));
    return 0;
  }

  if (command === 'source') {
    const file = firstPositional(args);
    if (!file) throw new Error('source requires a file argument.');
    process.stdout.write(await readSource(options.url, file, options.line, options.context));
    return 0;
  }

  if (command === 'mcp') {
    runMcp(options.url);
    return 0;
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = { url: DEFAULT_URL, line: null, context: null };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--url') options.url = requiredValue(args, ++i, '--url');
    else if (arg === '--line') options.line = positiveInt(requiredValue(args, ++i, '--line'));
    else if (arg === '--context') options.context = positiveInt(requiredValue(args, ++i, '--context'));
  }

  return options;
}

function firstPositional(args: string[]): string | null {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (!arg.startsWith('-')) return arg;
    if (arg === '--url' || arg === '--line' || arg === '--context') i += 1;
  }
  return null;
}

async function readObservation(baseUrl: string): Promise<string> {
  return fetchText(new URL(OBSERVATION_ENDPOINT, normalizeBaseUrl(baseUrl)));
}

async function readSource(
  baseUrl: string,
  file: string,
  line: number | null,
  context: number | null,
): Promise<string> {
  const url = new URL(SOURCE_ENDPOINT, normalizeBaseUrl(baseUrl));
  url.searchParams.set('file', file);
  if (line !== null) url.searchParams.set('line', String(line));
  if (context !== null) url.searchParams.set('context', String(context));
  return fetchText(url);
}

async function fetchText(url: URL): Promise<string> {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(text.trim() || `Request failed: ${response.status}`);
  return text.endsWith('\n') ? text : `${text}\n`;
}

function runMcp(baseUrl: string): void {
  const transport = new McpStdioTransport();

  transport.onMessage(async (message) => {
    if (!isRecord(message)) return;
    const id = message.id;
    const method = typeof message.method === 'string' ? message.method : '';

    try {
      if (method === 'initialize') {
        transport.send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'astro-styletrace', version: '0.1.0-beta.0' },
          },
        });
      } else if (method === 'tools/list') {
        transport.send({ jsonrpc: '2.0', id, result: { tools: tools() } });
      } else if (method === 'tools/call') {
        transport.send({ jsonrpc: '2.0', id, result: await callTool(baseUrl, message.params) });
      } else if (method === 'notifications/initialized') {
        return;
      } else {
        transport.send({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown method: ${method}` },
        });
      }
    } catch (error) {
      transport.send({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
      });
    }
  });
}

async function callTool(baseUrl: string, params: unknown): Promise<unknown> {
  if (!isRecord(params) || typeof params.name !== 'string') {
    throw new Error('tools/call requires a tool name.');
  }

  const args = isRecord(params.arguments) ? params.arguments : {};

  if (params.name === 'styletrace_observation') {
    return textToolResult(await readObservation(baseUrl));
  }

  if (params.name === 'styletrace_source') {
    const file = typeof args.file === 'string' ? args.file : '';
    if (!file) throw new Error('styletrace_source requires arguments.file.');
    const line = typeof args.line === 'number' ? args.line : null;
    const context = typeof args.context === 'number' ? args.context : null;
    return textToolResult(await readSource(baseUrl, file, line, context));
  }

  throw new Error(`Unknown tool: ${params.name}`);
}

function tools(): unknown[] {
  return [
    {
      name: 'styletrace_observation',
      description: 'Read the current astro-styletrace selection observation as vendor-neutral JSON.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'styletrace_source',
      description: 'Read a project source file, optionally around a line number.',
      inputSchema: {
        type: 'object',
        required: ['file'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          context: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  ];
}

function textToolResult(text: string): unknown {
  return { content: [{ type: 'text', text }] };
}

class McpStdioTransport {
  private buffer = Buffer.alloc(0);
  private handler: ((message: unknown) => void) | null = null;

  constructor() {
    process.stdin.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
  }

  onMessage(handler: (message: unknown) => void): void {
    this.handler = handler;
  }

  send(message: unknown): void {
    const body = JSON.stringify(message);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  private drain(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;

      const header = this.buffer.slice(0, headerEnd).toString('utf8');
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = Buffer.alloc(0);
        return;
      }

      const length = Number.parseInt(match[1] ?? '0', 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) return;

      const body = this.buffer.slice(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.slice(bodyEnd);
      this.handler?.(JSON.parse(body));
    }
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function positiveInt(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`Expected a positive integer, got ${value}.`);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got ${value}.`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function help(): string {
  return `astro-styletrace

Usage:
  astro-styletrace observation [--url http://localhost:4321]
  astro-styletrace source <file> [--line 12] [--context 6] [--url http://localhost:4321]
  astro-styletrace mcp [--url http://localhost:4321]
`;
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code !== 0) process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
