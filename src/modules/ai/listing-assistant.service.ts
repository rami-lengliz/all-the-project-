import { Injectable, BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service';

export interface ListingEnhancementInput {
  category: string;
  basicInfo: string;
  features?: string[];
  location?: string;
}

export interface ListingEnhancementResult {
  title: string;
  description: string;
  highlights: string[];
}

@Injectable()
export class ListingAssistantService {
  constructor(private aiService: AiService) {}

  /**
   * Generate a complete listing (title + description + highlights)
   */
  async generateListing(
    input: ListingEnhancementInput,
  ): Promise<ListingEnhancementResult> {
    if (!this.aiService.isAiEnabled()) {
      throw new BadRequestException(
        'AI features are not enabled. Please configure OPENAI_API_KEY.',
      );
    }

    const prompt = this.buildGenerationPrompt(input);

    const response = await this.aiService.generateCompletion(prompt, {
      maxTokens: 600,
      temperature: 0.8,
      systemPrompt: `You are an expert at creating compelling rental listings. Generate attractive, honest, and detailed listings that highlight key features and benefits. Always respond in valid JSON format.`,
    });

    return this.parseListingResponse(response);
  }

  /**
   * Enhance an existing description
   */
  async enhanceDescription(
    currentDescription: string,
    category: string,
  ): Promise<string> {
    if (!this.aiService.isAiEnabled()) {
      throw new BadRequestException('AI features are not enabled');
    }

    const prompt = `Improve this ${category} rental listing description. Make it more engaging and professional while keeping the same information. Keep it concise (2-3 paragraphs max).

Current description:
${currentDescription}

Enhanced description:`;

    return await this.aiService.generateCompletion(prompt, {
      maxTokens: 400,
      temperature: 0.7,
      systemPrompt: `You are an expert copywriter for rental listings. Enhance descriptions to be more compelling while staying truthful.`,
    });
  }

  /**
   * Generate catchy titles
   */
  async generateTitle(
    category: string,
    keyFeatures: string[],
    location?: string,
  ): Promise<string[]> {
    if (!this.aiService.isAiEnabled()) {
      throw new BadRequestException('AI features are not enabled');
    }

    const featuresText = keyFeatures.join(', ');
    const locationText = location ? ` in ${location}` : '';

    const prompt = `Generate 3 catchy, concise titles (max 60 characters each) for a ${category} rental listing${locationText} with these features: ${featuresText}.

Return only the titles, one per line, without numbering or bullets.`;

    const response = await this.aiService.generateCompletion(prompt, {
      maxTokens: 150,
      temperature: 0.9,
      systemPrompt: `You are a creative copywriter specializing in rental listing titles. Create attention-grabbing, honest titles.`,
    });

    return response
      .split('\n')
      .map((title) => title.trim())
      .filter((title) => title.length > 0)
      .slice(0, 3);
  }

  /**
   * Build prompt for full listing generation
   */
  private buildGenerationPrompt(input: ListingEnhancementInput): string {
    const featuresText = input.features?.length
      ? `\nKey features: ${input.features.join(', ')}`
      : '';
    const locationText = input.location ? `\nLocation: ${input.location}` : '';

    return `Generate a complete rental listing for a ${input.category}.

Basic information: ${input.basicInfo}${featuresText}${locationText}

Respond with a JSON object containing:
{
  "title": "A catchy, concise title (max 60 characters)",
  "description": "A compelling 2-3 paragraph description highlighting benefits and features",
  "highlights": ["3-5 key selling points as short phrases"]
}`;
  }

  /**
   * Parse AI response into structured format
   */
  private parseListingResponse(response: string): ListingEnhancementResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.title || !parsed.description || !parsed.highlights) {
        throw new Error('Missing required fields in response');
      }

      return {
        title: parsed.title.substring(0, 100), // Ensure reasonable length
        description: parsed.description,
        highlights: Array.isArray(parsed.highlights)
          ? parsed.highlights.slice(0, 5)
          : [],
      };
    } catch (error) {
      throw new BadRequestException(
        'Failed to parse AI response. Please try again.',
      );
    }
  }
}
