import { Test, TestingModule } from '@nestjs/testing';
import { AiSearchService } from './ai-search.service';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { ListingsService } from '../listings/listings.service';
import { CategoriesService } from '../categories/categories.service';

describe('AiSearchService - JSON Parsing and Validation', () => {
  let service: AiSearchService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AiSearchService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock-api-key'),
          },
        },
        {
          provide: AiService,
          useValue: {
            generateCompletion: jest.fn(),
          },
        },
        {
          provide: ListingsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: CategoriesService,
          useValue: {
            findNearbyWithCounts: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<AiSearchService>(AiSearchService);
  });

  describe('safeJsonParse', () => {
    it('should parse clean JSON directly', () => {
      const input = '{"mode":"RESULT","filters":{},"chips":[]}';
      const result = service['safeJsonParse'](input);

      expect(result).toBeDefined();
      expect(result.mode).toBe('RESULT');
    });

    it('should extract JSON from text with extra content before', () => {
      const input =
        'Here is the response: {"mode":"RESULT","filters":{},"chips":[]}';
      const result = service['safeJsonParse'](input);

      expect(result).toBeDefined();
      expect(result.mode).toBe('RESULT');
    });

    it('should extract JSON from text with extra content after', () => {
      const input =
        '{"mode":"RESULT","filters":{},"chips":[]} - end of response';
      const result = service['safeJsonParse'](input);

      expect(result).toBeDefined();
      expect(result.mode).toBe('RESULT');
    });

    it('should extract JSON from text with content before and after', () => {
      const input =
        'Sure! {"mode":"FOLLOW_UP","followUp":{"question":"When?","field":"dates"},"filters":{},"chips":[]} Hope this helps!';
      const result = service['safeJsonParse'](input);

      expect(result).toBeDefined();
      expect(result.mode).toBe('FOLLOW_UP');
    });

    it('should extract JSON from markdown code block', () => {
      const input = '```json\n{"mode":"RESULT","filters":{},"chips":[]}\n```';
      const result = service['safeJsonParse'](input);

      expect(result).toBeDefined();
      expect(result.mode).toBe('RESULT');
    });

    it('should return null for completely invalid JSON', () => {
      const input = 'This is not JSON at all';
      const result = service['safeJsonParse'](input);

      expect(result).toBeNull();
    });

    it('should return null for malformed JSON', () => {
      const input = '{"mode":"RESULT", invalid}';
      const result = service['safeJsonParse'](input);

      expect(result).toBeNull();
    });
  });

  describe('basicValidation', () => {
    it('should validate FOLLOW_UP mode with required fields', () => {
      const input = {
        mode: 'FOLLOW_UP',
        followUp: {
          question: 'Which dates?',
          field: 'dates',
        },
        filters: {},
        chips: [],
      };

      const result = service['basicValidation'](input);
      expect(result).toBeDefined();
      expect(result.mode).toBe('FOLLOW_UP');
    });

    it('should reject FOLLOW_UP without followUp.question', () => {
      const input = {
        mode: 'FOLLOW_UP',
        followUp: {},
        filters: {},
      };

      const result = service['basicValidation'](input);
      expect(result).toBeNull();
    });

    it('should validate RESULT mode with required fields', () => {
      const input = {
        mode: 'RESULT',
        filters: { q: 'villa' },
        chips: [],
      };

      const result = service['basicValidation'](input);
      expect(result).toBeDefined();
      expect(result.mode).toBe('RESULT');
    });

    it('should reject RESULT without filters object', () => {
      const input = {
        mode: 'RESULT',
        chips: [],
      };

      const result = service['basicValidation'](input);
      expect(result).toBeNull();
    });

    it('should add empty chips array if missing in RESULT', () => {
      const input = {
        mode: 'RESULT',
        filters: { q: 'villa' },
      };

      const result = service['basicValidation'](input);
      expect(result).toBeDefined();
      expect(Array.isArray(result.chips)).toBe(true);
      expect(result.chips.length).toBe(0);
    });

    it('should reject invalid mode', () => {
      const input = {
        mode: 'INVALID_MODE',
        filters: {},
      };

      const result = service['basicValidation'](input);
      expect(result).toBeNull();
    });

    it('should reject non-object input', () => {
      expect(service['basicValidation'](null)).toBeNull();
      expect(service['basicValidation'](undefined)).toBeNull();
      expect(service['basicValidation']('string')).toBeNull();
      expect(service['basicValidation'](123)).toBeNull();
    });
  });

  describe('AI Search Guardrails', () => {
    let aiService: AiService;
    let configService: ConfigService;
    let listingsService: ListingsService;

    beforeEach(() => {
      aiService = module.get<AiService>(AiService);
      configService = module.get<ConfigService>(ConfigService);
      listingsService = module.get<ListingsService>(ListingsService);
    });

    describe('Guardrail 1: followUpUsed=true forces RESULT', () => {
      it('should return RESULT mode when followUpUsed=true, even if AI suggests FOLLOW_UP', async () => {
        // Mock AI to return FOLLOW_UP
        jest.spyOn(aiService, 'generateCompletion').mockResolvedValue(
          JSON.stringify({
            mode: 'FOLLOW_UP',
            followUp: {
              question: 'Which dates?',
              field: 'dates',
            },
            filters: { q: 'villa' },
            chips: [{ key: 'q', label: 'villa' }],
          }),
        );

        const result = await service.search({
          query: 'villa',
          lat: 36.8578,
          lng: 11.092,
          radiusKm: 10,
          followUpUsed: true, // ✅ Force RESULT
          followUpAnswer: 'tomorrow',
        });

        expect(result.mode).toBe('RESULT');
        expect(result.followUp).toBeNull();
        expect(result.results).toBeDefined();
        expect(Array.isArray(result.chips)).toBe(true);
      });

      it('should return RESULT mode when followUpUsed=true with valid AI RESULT', async () => {
        // Mock AI to return RESULT
        jest.spyOn(aiService, 'generateCompletion').mockResolvedValue(
          JSON.stringify({
            mode: 'RESULT',
            filters: {
              q: 'villa',
              categorySlug: 'accommodation',
              maxPrice: 250,
            },
            chips: [
              { key: 'q', label: 'villa' },
              { key: 'category', label: 'Accommodation' },
            ],
          }),
        );

        const result = await service.search({
          query: 'villa under 250',
          followUpUsed: true,
          followUpAnswer: 'tomorrow',
        });

        expect(result.mode).toBe('RESULT');
        expect(result.followUp).toBeNull();
        expect(result.filters.q).toBe('villa');
        expect(result.chips.length).toBeGreaterThan(0);
      });
    });

    describe('Guardrail 2: Invalid AI output triggers fallback RESULT', () => {
      it('should return fallback RESULT when AI returns invalid JSON', async () => {
        // Mock AI to return invalid JSON
        jest
          .spyOn(aiService, 'generateCompletion')
          .mockResolvedValue('This is not valid JSON at all');

        const result = await service.search({
          query: 'villa',
          lat: 36.8578,
          lng: 11.092,
        });

        expect(result.mode).toBe('RESULT');
        expect(result.filters.q).toBe('villa');
        expect(result.followUp).toBeNull();
        expect(Array.isArray(result.chips)).toBe(true);
        expect(Array.isArray(result.results)).toBe(true);
      });

      it('should return fallback RESULT when AI returns malformed JSON', async () => {
        // Mock AI to return malformed JSON
        jest
          .spyOn(aiService, 'generateCompletion')
          .mockResolvedValue('{"mode": "RESULT", invalid}');

        const result = await service.search({
          query: 'tennis court',
        });

        expect(result.mode).toBe('RESULT');
        expect(result.filters.q).toBe('tennis court');
        expect(result.followUp).toBeNull();
        expect(Array.isArray(result.chips)).toBe(true);
      });

      it('should return fallback RESULT when AI throws error', async () => {
        // Mock AI to throw error
        jest
          .spyOn(aiService, 'generateCompletion')
          .mockRejectedValue(new Error('OpenAI API timeout'));

        const result = await service.search({
          query: 'car rental',
          lat: 36.8578,
          lng: 11.092,
        });

        expect(result.mode).toBe('RESULT');
        expect(result.filters.q).toBe('car rental');
        expect(result.followUp).toBeNull();
        expect(Array.isArray(result.chips)).toBe(true);
        expect(Array.isArray(result.results)).toBe(true);
      });

      it('should return fallback RESULT when OPENAI_API_KEY is missing', async () => {
        // Mock ConfigService to return empty API key
        jest.spyOn(configService, 'get').mockReturnValue('');

        const result = await service.search({
          query: 'villa',
        });

        expect(result.mode).toBe('RESULT');
        expect(result.filters.q).toBe('villa');
        expect(result.followUp).toBeNull();
        expect(Array.isArray(result.chips)).toBe(true);
        expect(Array.isArray(result.results)).toBe(true);

        // Verify AI was never called
        expect(aiService.generateCompletion).not.toHaveBeenCalled();
      });
    });

    describe('Guardrail 3: Chips array always exists in RESULT', () => {
      it('should include chips array in RESULT mode (with AI)', async () => {
        // Mock AI to return RESULT
        jest.spyOn(aiService, 'generateCompletion').mockResolvedValue(
          JSON.stringify({
            mode: 'RESULT',
            filters: {
              q: 'villa',
              categorySlug: 'accommodation',
            },
            chips: [
              { key: 'q', label: 'villa' },
              { key: 'category', label: 'Accommodation' },
            ],
          }),
        );

        const result = await service.search({
          query: 'villa',
        });

        expect(result.mode).toBe('RESULT');
        expect(Array.isArray(result.chips)).toBe(true);
        expect(result.chips.length).toBeGreaterThan(0);
        expect(result.chips[0]).toHaveProperty('key');
        expect(result.chips[0]).toHaveProperty('label');
      });

      it('should include chips array in fallback RESULT mode', async () => {
        // Mock ConfigService to trigger fallback
        jest.spyOn(configService, 'get').mockReturnValue('');

        const result = await service.search({
          query: 'tennis court',
          lat: 36.8578,
          lng: 11.092,
        });

        expect(result.mode).toBe('RESULT');
        expect(Array.isArray(result.chips)).toBe(true);
        expect(result.chips.length).toBeGreaterThan(0);
        expect(result.chips[0].key).toBe('q');
        expect(result.chips[0].label).toBe('tennis court');
      });

      it('should include chips array even with empty query', async () => {
        // Mock ConfigService to trigger fallback
        jest.spyOn(configService, 'get').mockReturnValue('');

        const result = await service.search({
          query: '   ', // Empty query after trim
        });

        expect(result.mode).toBe('RESULT');
        expect(Array.isArray(result.chips)).toBe(true);
        // Chips array exists (may be empty or have default chips like radius)
      });

      it('should include chips in FOLLOW_UP mode', async () => {
        // Mock AI to return FOLLOW_UP
        jest.spyOn(aiService, 'generateCompletion').mockResolvedValue(
          JSON.stringify({
            mode: 'FOLLOW_UP',
            followUp: {
              question: 'Which dates?',
              field: 'dates',
            },
            filters: { q: 'villa' },
            chips: [{ key: 'q', label: 'villa' }],
          }),
        );

        const result = await service.search({
          query: 'villa',
        });

        expect(result.mode).toBe('FOLLOW_UP');
        expect(Array.isArray(result.chips)).toBe(true);
        expect(result.chips.length).toBeGreaterThan(0);
      });
    });

    describe('Integration: Complete flow', () => {
      it('should handle FOLLOW_UP → RESULT flow correctly', async () => {
        // Call 1: FOLLOW_UP
        jest.spyOn(aiService, 'generateCompletion').mockResolvedValueOnce(
          JSON.stringify({
            mode: 'FOLLOW_UP',
            followUp: {
              question: 'Which dates?',
              field: 'dates',
            },
            filters: { q: 'villa' },
            chips: [{ key: 'q', label: 'villa' }],
          }),
        );

        const followUpResult = await service.search({
          query: 'villa',
          lat: 36.8578,
          lng: 11.092,
        });

        expect(followUpResult.mode).toBe('FOLLOW_UP');
        expect(followUpResult.followUp).toBeDefined();
        expect(followUpResult.results).toEqual([]);

        // Call 2: RESULT (followUpUsed=true)
        jest.spyOn(aiService, 'generateCompletion').mockResolvedValueOnce(
          JSON.stringify({
            mode: 'RESULT',
            filters: {
              q: 'villa',
              availableFrom: '2026-02-18',
              availableTo: '2026-02-20',
            },
            chips: [
              { key: 'q', label: 'villa' },
              { key: 'dates', label: '2026-02-18 to 2026-02-20' },
            ],
          }),
        );

        const resultResult = await service.search({
          query: 'villa',
          lat: 36.8578,
          lng: 11.092,
          followUpUsed: true,
          followUpAnswer: 'tomorrow for 3 days',
        });

        expect(resultResult.mode).toBe('RESULT');
        expect(resultResult.followUp).toBeNull();
        expect(Array.isArray(resultResult.results)).toBe(true);
        expect(Array.isArray(resultResult.chips)).toBe(true);
      });
    });
  });
});
