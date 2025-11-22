import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execSync } from 'child_process';

const server = new McpServer({
  name: 'bytecode-analyzer-mcp',
  version: '0.1.0',
});

const analysisPrompt = `
Analyze the code's bytecode, and try to come up with different solutions where the code
remains legible, performant and optimized, if there isn't any alternative then improve the
existing code.

- Stay aware of alternative solutions that may trigger inlining and/or less
indirection/reflection that might confuse JVM or the compiler optimizations.
- Give small code snippets as examples where applicable.
- If there isn't any apparent improvement, don't suggest anything.
`

server.registerTool(
  'analyzeBytecode',
  {
    title: 'Run Bytecode Analysis',
    description: 'Analyze JVM .class bytecode for better insights on perfomance and optimizations.',
    inputSchema: {
      className: z.string().describe('The name of the class to analyze'),
      cwd: z.string().optional().describe('The current working directory to search in'),
    },
  },
  async (input) => {
    const { className, cwd } = input;

    console.log(`Analyzing bytecode for class: ${className} in directory: ${cwd}`);

    const underscoreClassName = className.replace(/-/g, '_'); 

    const rawBytecode = execSync(
      `find ${cwd} -type f -name '${underscoreClassName}*.class' | sort -r | xargs -n1 -I{} javap -c {}`,
      'utf-8'
    ).toString();

    if (!rawBytecode || rawBytecode.trim() === '') {
      return {
        content: [
          { type: 'text', text: "Could not retrieve bytecode. Ensure the class name is correct or class files are defined in the current working directory." },
        ],
      }
    }

    return {
      content: [
        { type: 'text', text: rawBytecode },
        { type: 'text', text: analysisPrompt },
      ],
    };
  }
);


const transport = new StdioServerTransport();
await server.connect(transport);
