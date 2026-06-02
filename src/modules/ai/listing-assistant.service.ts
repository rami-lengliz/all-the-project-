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
      // Skip Gemini 2.5-flash "thinking" — it expands to consume the whole budget
      // and truncates the JSON, forcing the parse fallback. (No-op for OpenAI/Groq.)
      reasoningEffort: 'none',
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

    const prompt = `Rewrite the following ${category} rental listing description so it is more engaging, vivid, and professional. Keep the same facts. Keep it concise (2-3 short paragraphs). Output ONLY the rewritten description — no preface, no explanation, no quotes, no "Here is", no options to pick from.

Original:
"""
${currentDescription}
"""`;

    const raw = await this.aiService.generateCompletion(prompt, {
      // Gemini 2.5-flash "thinking" tokens expand to fill max_tokens and truncate
      // the output, so we disable thinking instead of just over-budgeting.
      maxTokens: 800,
      temperature: 0.7,
      systemPrompt: `You are an expert copywriter for rental listings. Reply with the rewritten description only — never with commentary, options, or meta-text.`,
      reasoningEffort: 'none',
    });

    // Strip common preamble patterns that LLMs sometimes inject despite instructions
    return raw
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(here(?:'s| is| are)[^:]*:|enhanced description:|option \d+:?)\s*/i, '')
      .replace(/^\s*\*\*[^*]+\*\*\s*/g, '')
      .trim();
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

    const prompt = `Generate exactly 3 catchy rental listing titles for a ${category}${locationText}. Features: ${featuresText}.

Rules:
- Each title is max 60 characters.
- Output ONLY a JSON array of 3 strings. No preface, no explanation, no markdown.
- Example: ["Title one","Title two","Title three"]`;

    const response = await this.aiService.generateCompletion(prompt, {
      // Gemini 2.5-flash "thinking" tokens expand to fill max_tokens and truncate
      // the JSON array, so we disable thinking instead of just over-budgeting.
      maxTokens: 400,
      temperature: 0.9,
      systemPrompt: `You are a creative copywriter for rental listings. Always reply with a JSON array of strings — never with prose, options, or markdown.`,
      reasoningEffort: 'none',
    });

    // Try JSON parse first (preferred path), fall back to line-splitting.
    const cleaned = response
      .replace(/```json?/gi, '')
      .replace(/```/g, '')
      .trim();

    try {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) {
          const titles = arr
            .map((t) => String(t).trim())
            .filter((t) => t.length > 0)
            .slice(0, 3);
          if (titles.length > 0) return titles;
        }
      }
    } catch {
      // fall through to line-splitting
    }

    return cleaned
      .split('\n')
      .map((title) =>
        title
          .trim()
          // Strip numbering, bullets, surrounding quotes, "Title N:" prefixes
          .replace(/^[\d]+\.\s*/, '')
          .replace(/^[-*•]\s*/, '')
          .replace(/^title\s*\d*\s*:?\s*/i, '')
          .replace(/^["'`]+|["'`,]+$/g, '')
          .trim(),
      )
      .filter((title) => title.length > 0 && title.length <= 80)
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
    } catch (_error) {
      throw new BadRequestException(
        'Failed to parse AI response. Please try again.',
      );
    }
  }
}
