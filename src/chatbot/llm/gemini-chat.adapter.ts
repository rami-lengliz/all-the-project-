import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ILlmAdapter } from './llm-adapter.interface';
import {
  LlmConversationTurn,
  LlmAssistantOutput,
  LlmGenerationOptions,
} from './llm.types';

// ── Gemini REST API types ──────────────────────────────────────────────────
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: any };
  functionResponse?: { name: string; response: any };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

@Injectable()
export class GeminiChatAdapter implements ILlmAdapter {
  private readonly logger = new Logger(GeminiChatAdapter.name);
  private readonly apiKey: string | null;
  private readonly defaultModel: string;

  // Gemini REST base — v1beta supports gemini-2.0-flash and function calling
  private readonly baseUrl =
    'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || null;
    this.defaultModel =
      this.configService.get<string>('AI_MODEL') || 'gemini-2.0-flash';

    if (this.apiKey) {
      this.logger.log(
        `Gemini adapter initialised via REST (model: ${this.defaultModel})`,
      );
    } else {
      this.logger.warn(
        'GEMINI_API_KEY is not set. Chatbot LLM adapter cannot execute calls.',
      );
    }
  }

  public async generateResponse(
    history: LlmConversationTurn[],
    options: LlmGenerationOptions,
  ): Promise<LlmAssistantOutput> {
    if (!this.apiKey) {
      throw new Error('LLM provider is unconfigured.');
    }

    const modelName = options.model || this.defaultModel;

    // ── Map history to Gemini Content[] ───────────────────────────────────
    const contents: GeminiContent[] = [];

    for (const turn of history) {
      if (turn.role === 'system') continue; // handled via systemInstruction

      if (turn.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: turn.content }] });
      } else if (turn.role === 'assistant') {
        if (turn.toolRequests && turn.toolRequests.length > 0) {
          contents.push({
            role: 'model',
            parts: turn.toolRequests.map((req) => ({
              functionCall: { name: req.name, args: req.arguments },
            })),
          });
        } else {
          contents.push({
            role: 'model',
            parts: [{ text: turn.content || '' }],
          });
        }
      } else if (turn.role === 'tool') {
        let responseData: any;
        try {
          responseData = JSON.parse(turn.content);
        } catch {
          responseData = { result: turn.content };
        }
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: turn.toolName || 'unknown_tool',
                response: responseData,
              },
            },
          ],
        });
      }
    }

    // ── Build request body ─────────────────────────────────────────────────
    const requestBody: any = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    };

    // System instruction
    if (options.systemPrompt) {
      requestBody.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    // Tools / function calling
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = [
        {
          functionDeclarations: options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.schema,
          })),
        },
      ];

      if (options.forceToolName) {
        requestBody.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [options.forceToolName],
          },
        };
      }
    }

    const url = `${this.baseUrl}/${modelName}:generateContent?key=${this.apiKey}`;

    try {
      const { data } = await axios.post<GeminiResponse>(url, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 12000,
      });

      const candidate = data.candidates?.[0];
      if (!candidate) {
        throw new Error('Gemini returned no candidates.');
      }

      const parts = candidate.content?.parts ?? [];
      const finishReason = candidate.finishReason;

      // Text
      const text = parts
        .filter((p): p is { text: string } => typeof p.text === 'string')
        .map((p) => p.text)
        .join('');

      // Function calls
      const functionCallParts = parts.filter(
        (p): p is { functionCall: { name: string; args: any } } =>
          !!p.functionCall,
      );

      const toolRequests = functionCallParts.map((p, idx) => ({
        id: `gemini-call-${Date.now()}-${idx}`,
        name: p.functionCall.name,
        arguments:
          typeof p.functionCall.args === 'string'
            ? JSON.parse(p.functionCall.args)
            : p.functionCall.args ?? {},
      }));

      const hasFunctionCalls = toolRequests.length > 0;

      const mappedFinishReason: LlmAssistantOutput['finishReason'] =
        hasFunctionCalls
          ? 'tool_calls'
          : finishReason === 'STOP'
            ? 'stop'
            : finishReason === 'MAX_TOKENS'
              ? 'length'
              : finishReason === 'SAFETY'
                ? 'content_filter'
                : 'unknown';

      const usageMeta = data.usageMetadata;

      return {
        text,
        finishReason: mappedFinishReason,
        toolRequests,
        metadata: {
          usage: usageMeta
            ? {
                promptTokens: usageMeta.promptTokenCount,
                completionTokens: usageMeta.candidatesTokenCount,
                totalTokens: usageMeta.totalTokenCount,
              }
            : undefined,
        },
      };
    } catch (error) {
      const detail =
        error.response?.data?.error?.message ?? error.message;
      const status = error.response?.status;
      this.logger.error(
        `Gemini REST API error [${modelName}] HTTP ${status}: ${detail}`,
      );
      // Surface a typed error so the resilience service classifies it correctly
      const err: any = new Error(detail);
      err.status = status;
      throw err;
    }
  }
}
