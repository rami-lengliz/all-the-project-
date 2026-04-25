import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SearchListingsToolSchema } from './schemas/search-listings.schema';
import { LlmToolDefinition } from '../llm/llm.types';

export interface RegisteredTool {
  name: string;
  description: string;
  schema: z.ZodType<any, any, any>;
  jsonSchema: any; // Used to pass to LLM
  handler: (args: any, context?: any) => Promise<any>;
}

@Injectable()
export class ToolRegistryService {
  private registry: Map<string, RegisteredTool> = new Map();

  public registerTool(tool: RegisteredTool) {
    if (this.registry.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered.`);
    }
    this.registry.set(tool.name, tool);
  }

  public getTool(name: string): RegisteredTool | undefined {
    return this.registry.get(name);
  }

  public getAllowedTools(allowedNames: string[]): LlmToolDefinition[] {
    const definitions: LlmToolDefinition[] = [];
    for (const name of allowedNames) {
      const tool = this.registry.get(name);
      if (tool) {
        definitions.push({
          name: tool.name,
          description: tool.description,
          schema: tool.jsonSchema,
        });
      }
    }
    return definitions;
  }
}
