import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AiProvider,
  AiProviderInfo,
  CompletionOptions,
} from './ai-provider.interface';

@Injectable()
export class OpenAiProvider implements AiProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly client: OpenAI | null = null;
  private readonly model: string;

  readonly info: AiProviderInfo;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model = this.configService.get<string>('AI_MODEL', 'gpt-4o-mini');

    if (!apiKey || apiKey.trim() === '') {
      this.logger.warn(
        'OpenAI API key not configured. OpenAiProvider will be unavailable.',
      );
      this.info = { name: 'openai', model: this.model, isAvailable: false };
    } else {
      this.client = new OpenAI({ apiKey });
      this.info = { name: 'openai', model: this.model, isAvailable: true };
      this.logger.log(
        `OpenAiProvider initialised (model: ${this.model})`,
      );
    }
  }

  /**
   * Generate a single-turn completion via the OpenAI Chat Completions API.
   * Behaviour is identical to the original AiService.generateCompletion().
   */
  async generateCompletion(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<string> {
    if (!this.client) {
      throw new Error(
        'AI features are not enabled. Please configure OPENAI_API_KEY.',
      );
    }

    const {
      maxTokens = 500,
      temperature = 0.7,
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
        throw new Error('No content in OpenAI response');
      }

      return content.trim();
    } catch (error) {
      this.logger.error('Error generating completion:', error);
      throw new Error('Failed to generate AI completion');
    }
  }
}
