import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AiProvider,
  AiProviderInfo,
  CompletionOptions,
} from './ai-provider.interface';

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

@Injectable()
export class GroqProvider implements AiProvider {
  private readonly logger = new Logger(GroqProvider.name);
  private readonly client: OpenAI | null = null;
  private readonly model: string;

  readonly info: AiProviderInfo;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    this.model = this.configService.get<string>('GROQ_MODEL', DEFAULT_GROQ_MODEL);

    if (!apiKey || apiKey.trim() === '') {
      this.logger.warn(
        'GROQ_API_KEY not configured. GroqProvider will be unavailable.',
      );
      this.info = { name: 'groq', model: this.model, isAvailable: false };
    } else {
      this.client = new OpenAI({ 
        apiKey, 
        baseURL: 'https://api.groq.com/openai/v1' 
      });
      this.info = { name: 'groq', model: this.model, isAvailable: true };
      this.logger.log(`GroqProvider initialised (model: ${this.model})`);
    }
  }

  async generateCompletion(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<string> {
    if (!this.client) {
      throw new Error(
        'GroqProvider is not available. Please configure GROQ_API_KEY.',
      );
    }

    const {
      maxTokens = 800,
      temperature = 0.3,
      systemPrompt = 'You are a helpful assistant for a rental platform.',
    } = options;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content in Groq response');
      }

      return content.trim();
    } catch (error) {
      this.logger.error('Groq API call failed:', error);
      throw new Error(`GroqProvider: failed to generate completion — ${(error as Error).message}`);
    }
  }
}
