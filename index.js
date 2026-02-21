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

// Strategy pattern for language-specific bytecode generation instructions
const bytecodeGenerationStrategies = {
  clojure: {
    instructions: [
      'Always check and create ./classes in the current working directory if it doesn\'t exist.',
      'Run: clojure -M:dev -e "(compile \'my.file.namespace)"',
    ],
  },
  java: {
    instructions: [
      'Compile Java source files with: javac -d ./classes src/path/to/YourClass.java',
      'Ensure the output directory exists before compilation.',
    ],
  },
  kotlin: {
    instructions: [
      'Compile Kotlin source files with: kotlinc -d ./classes src/path/to/YourClass.kt',
      'For projects using Gradle/Maven, run the build task to generate .class files.',
    ],
  },
  scala: {
    instructions: [
      'Compile Scala source files with: scalac -d ./classes src/path/to/YourClass.scala',
      'For SBT projects, run: sbt compile',
    ],
  },
  groovy: {
    instructions: [
      'Compile Groovy source files with: groovyc -d ./classes src/path/to/YourClass.groovy',
      'Ensure GROOVY_HOME is set in your environment.',
    ],
  },
};

function getBytecodeGenerationInstructions(language) {
  const strategy = bytecodeGenerationStrategies[language?.toLowerCase()];
  if (strategy) {
    return `Instructions for ${language}:\n${strategy.instructions.map((inst, idx) => `  ${idx + 1}. ${inst}`).join('\n')}`;
  }
  
  // Default instructions for unknown languages
  const allLanguages = Object.keys(bytecodeGenerationStrategies).join(', ');
  return `Supported languages: ${allLanguages}\n\nGeneral instructions:\n  1. Compile your source files to generate .class files\n  2. Ensure the .class files are in a searchable directory\n  3. Specify the correct className and cwd parameters`;
}

server.registerTool(
  'analyzeBytecode',
  {
    title: 'Run Bytecode Analysis for JVM',
    description: "Analyze JVM .class bytecode of JVM compiled languages for better insights on perfomance and optimizations.",
    inputSchema: {
      className: z.string().describe("The name of the class to analyze. It shouldn't include the full path or full namespace. For example: className 'my_class' for 'com.example.my-class'. The MCP looks for all bytecode files genereated like my_class*.class."),
      cwd: z.string().optional().describe('The current root directory to search in. Never the class path, always the root directory of the project.'),
      language: z.enum(['clojure', 'java', 'kotlin', 'scala', 'groovy']).optional().describe('The JVM language used (clojure, java, kotlin, scala, groovy). Used to provide language-specific compilation instructions if bytecode files are not found.'),
    },
  },
  async (input) => {
    const { className, cwd, language } = input;

    // Validate className to prevent command injection
    if (!className || typeof className !== 'string') {
      return {
        content: [
          { type: 'text', text: "Error: className is required and must be a string." },
        ],
      };
    }

    // Only allow alphanumeric characters, hyphens, underscores, and dots
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(className)) {
      return {
        content: [
          { type: 'text', text: "Error: className contains invalid characters. Only alphanumeric characters, hyphens, underscores, and dots are allowed." },
        ],
      };
    }

    // Validate cwd to prevent command injection
    if (cwd !== undefined) {
      if (typeof cwd !== 'string') {
        return {
          content: [
            { type: 'text', text: "Error: cwd must be a string." },
          ],
        };
      }

      // Check for shell metacharacters that could be used for injection
      if (/[;&|`$()<>\\"]/.test(cwd)) {
        return {
          content: [
            { type: 'text', text: "Error: cwd contains invalid characters." },
          ],
        };
      }
    }

    // Validate language parameter if provided
    if (language !== undefined) {
      const validLanguages = ['clojure', 'java', 'kotlin', 'scala', 'groovy'];
      if (!validLanguages.includes(language.toLowerCase())) {
        return {
          content: [
            { type: 'text', text: `Error: Invalid language '${language}'. Supported languages: ${validLanguages.join(', ')}.` },
          ],
        };
      }
    }

    const underscoreClassName = className.replace(/-/g, '_'); 

    const searchPath = cwd || '.';
    const rawBytecode = execSync(
      `find ${searchPath} -type f -name '${underscoreClassName}*.class' | sort -r | xargs -n1 -I{} javap -c {}`,
      'utf-8'
    ).toString();

    if (!rawBytecode || rawBytecode.trim() === '') {
      return {
        content: [
          { type: 'text', text: "Could not retrieve bytecode. Ensure the class name is correct or class files are defined in the current working directory." },
          { type: 'text', text: `Run the current language's compiler to generate the bytecode.\n\n${getBytecodeGenerationInstructions(language)}` },
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
