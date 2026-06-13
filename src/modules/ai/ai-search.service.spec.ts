import { Test, TestingModule } from '@nestjs/testing';
import { AiSearchService } from './ai-search.service';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { ListingsService } from '../listings/listings.service';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../../database/prisma.service';
import { EmbeddingService } from './embedding.service';

/**
 * Unit tests for the AI-search NLU layer.
 *
 * The service uses a two-stage pipeline: the LLM does narrow entity extraction,
 * then deterministic code (parseNlu) validates and normalises the JSON into a
 * structured intent. These tests exercise parseNlu directly — the
 * JSON-parsing and deterministic-fallback behaviour the report relies on — with
 * no live AI call, so they are fully reproducible.
 */
describe('AiSearchService - NLU JSON parsing and fallback', () => {
  let service: AiSearchService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AiSearchService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('mock') } },
        { provide: AiService, useValue: { generateCompletion: jest.fn() } },
        { provide: ListingsService, useValue: { findAll: jest.fn().mockResolvedValue([]) } },
        { provide: CategoriesService, useValue: { findNearbyWithCounts: jest.fn().mockResolvedValue([]) } },
        { provide: PrismaService, useValue: { aiSearchLog: { create: jest.fn().mockResolvedValue({}) } } },
        { provide: EmbeddingService, useValue: { isAvailable: false, findSimilarListings: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get<AiSearchService>(AiSearchService);
  });

  const parse = (raw: string) => service['parseNlu'](raw) as any;

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('valid JSON extraction', () => {
    it('parses a clean NLU template into a structured intent', () => {
      const r = parse('{"categorySlug":"stays","priceMax":500,"locationName":"Kelibia"}');
      expect(r.categorySlug).toBe('stays');
      expect(r.priceMax).toBe(500);
      expect(r.locationName).toBe('kelibia'); // normalised to lowercase
    });

    it('lowercases and trims the searchKeyword', () => {
      const r = parse('{"categorySlug":"mobility","searchKeyword":"  Scooter  "}');
      expect(r.searchKeyword).toBe('scooter');
    });

    it('parses JSON wrapped in a ```json markdown fence', () => {
      const r = parse('```json\n{"categorySlug":"sports-facilities"}\n```');
      expect(r.categorySlug).toBe('sports-facilities');
    });

    it('keeps nearSea only when explicitly true', () => {
      expect(parse('{"nearSea":true}').nearSea).toBe(true);
      expect(parse('{"nearSea":false}').nearSea).toBeNull();
    });

    it('accepts a valid ISO date and rejects a malformed one', () => {
      expect(parse('{"availableFrom":"2026-07-10"}').availableFrom).toBe('2026-07-10');
      expect(parse('{"availableFrom":"10 July"}').availableFrom).toBeNull();
    });
  });

  describe('validation / normalisation guardrails', () => {
    it('discards a category slug that is not in the whitelist', () => {
      expect(parse('{"categorySlug":"restaurants"}').categorySlug).toBeNull();
    });

    it('never returns a zero or negative price (treated as absent)', () => {
      expect(parse('{"priceMax":0}').priceMax).toBeNull();
      expect(parse('{"priceMin":-5}').priceMin).toBeNull();
    });

    it('only accepts known booking types', () => {
      expect(parse('{"bookingType":"SLOT"}').bookingType).toBe('SLOT');
      expect(parse('{"bookingType":"HOURLY"}').bookingType).toBeNull();
    });
  });

  describe('deterministic fallback on bad input', () => {
    const EMPTY = {
      categorySlug: null, searchKeyword: null, priceMin: null, priceMax: null,
      locationName: null, nearSea: null, availableFrom: null, availableTo: null,
      amenities: [], bookingType: null, sortPreference: null,
    };

    it('returns an empty intent for non-JSON text instead of throwing', () => {
      expect(parse('this is not json at all')).toEqual(EMPTY);
    });

    it('returns an empty intent for malformed JSON instead of throwing', () => {
      expect(parse('{"categorySlug":"stays", invalid}')).toEqual(EMPTY);
    });
  });

  describe('backward-compatible {mode, filters} payload', () => {
    it('extracts the intent from the legacy search response shape', () => {
      const r = parse('{"mode":"RESULT","filters":{"categorySlug":"stays","maxPrice":300,"city":"Tunis"}}');
      expect(r.categorySlug).toBe('stays');
      expect(r.priceMax).toBe(300);
      expect(r.locationName).toBe('tunis');
    });
  });
});
