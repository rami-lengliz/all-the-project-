/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AiSearchRequestDto } from '../models/AiSearchRequestDto';
import type { EnhanceDescriptionDto } from '../models/EnhanceDescriptionDto';
import type { GenerateListingDto } from '../models/GenerateListingDto';
import type { GenerateTitleDto } from '../models/GenerateTitleDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AiService {
    /**
     * AI-powered search with natural language
     * Converts natural language queries into structured filters. Supports max 1 follow-up question for clarification. Returns either FOLLOW_UP mode (if clarification needed) or RESULT mode with listings. All responses have stable keys: mode, filters, chips, followUp, results.
     * @param requestBody
     * @returns any Search results or follow-up question
     * @throws ApiError
     */
    public static aiControllerSearch(
        requestBody: AiSearchRequestDto,
    ): CancelablePromise<({
        mode?: 'FOLLOW_UP';
        followUp?: {
            question?: string;
            field?: 'dates' | 'price' | 'category' | 'bookingType' | 'location' | 'other';
            options?: Array<string>;
        };
        filters?: {
            'q'?: string;
            categorySlug?: string;
            minPrice?: number | null;
            maxPrice?: number;
            bookingType?: 'DAILY' | 'SLOT' | 'ANY' | null;
            availableFrom?: string | null;
            availableTo?: string | null;
            sortBy?: 'distance' | 'date' | 'price_asc' | 'price_desc';
            radiusKm?: number;
        };
        chips?: Array<{
            key?: string;
            label?: string;
        }>;
        /**
         * Always empty in FOLLOW_UP mode
         */
        results?: any[];
    } | {
        mode?: 'RESULT';
        filters?: {
            'q'?: string;
            categorySlug?: string;
            minPrice?: number | null;
            maxPrice?: number;
            bookingType?: 'DAILY' | 'SLOT' | 'ANY';
            availableFrom?: string;
            availableTo?: string;
            sortBy?: 'distance' | 'date' | 'price_asc' | 'price_desc';
            radiusKm?: number;
        };
        chips?: Array<{
            key?: string;
            label?: string;
        }>;
        /**
         * Always null in RESULT mode
         */
        followUp?: null;
        /**
         * Array of listing summaries
         */
        results?: Array<Record<string, any>>;
    })> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/ai/search',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * [Dev/Admin] List recent AI search logs
     * Returns the last N AI search log entries. Useful for PFE demo and debugging.
     * @param limit
     * @returns any
     * @throws ApiError
     */
    public static aiControllerGetSearchLogs(
        limit?: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/ai/admin/search-logs',
            query: {
                'limit': limit,
            },
        });
    }
    /**
     * Generate complete listing (title, description, highlights)
     * @param requestBody
     * @returns any Listing generated successfully
     * @throws ApiError
     */
    public static aiControllerGenerateListing(
        requestBody: GenerateListingDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/ai/generate',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Enhance existing listing description
     * @param requestBody
     * @returns any Description enhanced successfully
     * @throws ApiError
     */
    public static aiControllerEnhanceDescription(
        requestBody: EnhanceDescriptionDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/ai/enhance-description',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Generate catchy listing titles
     * @param requestBody
     * @returns any Titles generated successfully
     * @throws ApiError
     */
    public static aiControllerGenerateTitles(
        requestBody: GenerateTitleDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/ai/generate-titles',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
