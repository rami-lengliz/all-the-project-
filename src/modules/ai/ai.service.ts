import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface CompletionOptions {
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
}

export interface ModerationResult {
    flagged: boolean;
    categories: string[];
    scores: Record<string, number>;
}

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private openai: OpenAI | null = null;
    private readonly isEnabled: boolean;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');

        if (!apiKey || apiKey.trim() === '') {
            this.logger.warn('OpenAI API key not configured. AI features will be disabled.');
            this.isEnabled = false;
        } else {
            this.openai = new OpenAI({ apiKey });
            this.isEnabled = true;
            this.logger.log('OpenAI client initialized successfully');
        }
    }

    /**
     * Check if AI features are enabled
     */
    isAiEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Generate a completion using OpenAI
     */
    async generateCompletion(
        prompt: string,
        options: CompletionOptions = {},
    ): Promise<string> {
        if (!this.isEnabled || !this.openai) {
            throw new Error('AI features are not enabled. Please configure OPENAI_API_KEY.');
        }

        const {
            maxTokens = 500,
            temperature = 0.7,
            systemPrompt = 'You are a helpful assistant for a rental platform.',
        } = options;

        try {
            const model = this.configService.get<string>('AI_MODEL', 'gpt-4o-mini');

            const response = await this.openai.chat.completions.create({
                model,
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

    /**
     * Generate embeddings for semantic search (optional advanced feature)
     */
    async generateEmbedding(text: string): Promise<number[]> {
        if (!this.isEnabled || !this.openai) {
            throw new Error('AI features are not enabled');
        }

        try {
            const response = await this.openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: text,
            });

            return response.data[0].embedding;
        } catch (error) {
            this.logger.error('Error generating embedding:', error);
            throw new Error('Failed to generate embedding');
        }
    }

    /**
     * Moderate content for inappropriate material
     */
    async moderateContent(text: string): Promise<ModerationResult> {
        if (!this.isEnabled || !this.openai) {
            // Return safe result if AI is disabled
            return {
                flagged: false,
                categories: [],
                scores: {},
            };
        }

        try {
            const response = await this.openai.moderations.create({
                input: text,
            });

            const result = response.results[0];
            const flaggedCategories = Object.entries(result.categories)
                .filter(([_, flagged]) => flagged)
                .map(([category]) => category);

            return {
                flagged: result.flagged,
                categories: flaggedCategories,
                scores: result.category_scores as unknown as Record<string, number>,
            };
        } catch (error) {
            this.logger.error('Error moderating content:', error);
            // Return safe result on error (fail open)
            return {
                flagged: false,
                categories: [],
                scores: {},
            };
        }
    }

    /**
     * Count tokens in a text (approximate)
     */
    estimateTokens(text: string): number {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
}
