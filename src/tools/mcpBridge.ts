import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolExecutionContext, ToolResult, ToolSpec, McpServerConfig } from '../core/types.js';

interface McpSession {
  server: McpServerConfig;
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  toolNames: Map<string, string>;
}

function stringifyToolContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  return `${JSON.stringify(content, null, 2)}\n`;
}

function formatToolResult(result: unknown): ToolResult {
  if (result && typeof result === 'object' && 'content' in result) {
    const raw = result as {
      content?: unknown;
      isError?: boolean;
    };

    return {
      content: Array.isArray(raw.content)
        ? raw.content.map((item) => stringifyToolContent(item)).join('\n')
        : stringifyToolContent(raw.content),
      isError: raw.isError ?? false,
      raw: result
    };
  }

  return {
    content: stringifyToolContent(result),
    raw: result
  };
}

async function createSession(server: McpServerConfig): Promise<McpSession> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

  const client = new Client({
    name: 'nexus-agi',
    version: '0.1.0'
  });

  let transport: StdioClientTransport | StreamableHTTPClientTransport;
  if (server.transport === 'stdio') {
    transport = new StdioClientTransport({
      command: server.command ?? 'node',
      args: server.args ?? [],
      ...(server.cwd ? { cwd: server.cwd } : {}),
      ...(server.env ? { env: server.env } : {})
    });
  } else {
    transport = new StreamableHTTPClientTransport(new URL(server.url ?? ''), {
      ...(server.headers ? { requestInit: { headers: server.headers } } : {})
    });
  }

  await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);

  const toolNames = new Map<string, string>();
  let cursor: string | undefined;

  do {
    const page = await client.listTools({ cursor });
    for (const tool of page.tools) {
      toolNames.set(`${server.name}.${tool.name}`, tool.name);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  return {
    server,
    client,
    transport,
    toolNames
  };
}

export class McpBridge {
  private readonly sessions = new Map<string, McpSession>();

  public async refresh(servers: McpServerConfig[]): Promise<ToolSpec[]> {
    const enabledServers = servers.filter((server) => server.enabled ?? true);
    const specs: ToolSpec[] = [];
    const nextSessions = new Map<string, McpSession>();

    try {
      for (const server of enabledServers) {
        if (!server.name.trim()) {
          continue;
        }

        const session = await createSession(server);
        nextSessions.set(server.name, session);

        for (const [fullName, originalName] of session.toolNames.entries()) {
          specs.push({
            name: fullName,
            description: `MCP tool from ${server.name}: ${originalName}`,
            inputSchema: {
              type: 'object',
              additionalProperties: true
            }
          });
        }
      }

      const oldSessions = [...this.sessions.values()];
      this.sessions.clear();
      for (const [serverName, session] of nextSessions.entries()) {
        this.sessions.set(serverName, session);
      }

      for (const session of oldSessions) {
        try {
          await session.client.close();
        } finally {
          await session.transport.close();
        }
      }

      return specs;
    } catch (error) {
      for (const session of nextSessions.values()) {
        try {
          await session.client.close();
        } finally {
          await session.transport.close();
        }
      }

      throw error;
    }
  }

  public async invoke(name: string, input: unknown, _context: ToolExecutionContext): Promise<ToolResult> {
    void _context;
    const session = [...this.sessions.values()].find((candidate) => candidate.toolNames.has(name));
    if (!session) {
      throw new Error(`MCP tool not connected: ${name}`);
    }

    const originalName = session.toolNames.get(name);
    if (!originalName) {
      throw new Error(`MCP tool not found: ${name}`);
    }

    const result = await session.client.callTool({
      name: originalName,
      arguments: typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
    });

    return formatToolResult(result);
  }

  public async dispose(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();

    for (const session of sessions) {
      try {
        await session.client.close();
      } finally {
        await session.transport.close();
      }
    }
  }
}
