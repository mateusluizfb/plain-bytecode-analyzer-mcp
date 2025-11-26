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

// TODO: Extract the language programmatically. So we don't add another languages' info unecessarily.
const bytecodeGenerationPromptByLanguage = `
  clojure:
    1. Always check and create ./classes in the current working directory if it doesn't exist.
    2. Run clojure -M:dev -e "(compile 'my.file.namespace)"
`

server.registerTool(
  'analyzeBytecode',
  {
    title: 'Run Bytecode Analysis for JVM',
    description: "Analyze JVM .class bytecode of JVM compiled languages for better insights on perfomance and optimizations.",
    inputSchema: {
      className: z.string().describe("The name of the class to analyze. It shouldn't include the full path or full namespace. For example: className 'my_class' for 'com.example.my-class'. The MCP looks for all bytecode files genereated like my_class*.class."),
      cwd: z.string().optional().describe('The current root directory to search in. Never the class path, always the root directory of the project.'),
    },
  },
  async (input) => {
    const { className, cwd } = input;

    const underscoreClassName = className.replace(/-/g, '_'); 

    const rawBytecode = execSync(
      `find ${cwd} -type f -name '${underscoreClassName}*.class' | sort -r | xargs -n1 -I{} javap -c {}`,
      'utf-8'
    ).toString();

    if (!rawBytecode || rawBytecode.trim() === '') {
      return {
        content: [
          { type: 'text', text: "Could not retrieve bytecode. Ensure the class name is correct or class files are defined in the current working directory." },
          { type: 'text', text: `Run the current's language compiler to generate the bytecode. Always follow these instructions for the given language:\n${bytecodeGenerationPromptByLanguage}` },
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
