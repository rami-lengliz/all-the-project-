/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateListingDto } from '../models/CreateListingDto';
import type { UpdateListingDto } from '../models/UpdateListingDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ListingsService {
    /**
     * Create a new listing (host only)
     * @param formData
     * @returns any
     * @throws ApiError
     */
    public static listingsControllerCreate(
        formData: CreateListingDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/api/listings',
            formData: formData,
            mediaType: 'multipart/form-data',
        });
    }
    /**
     * Search listings with filters
     * @param q
     * @param category
     * @param minPrice
     * @param maxPrice
     * @param lat
     * @param lng
     * @param radiusKm
     * @param availableFrom
     * @param availableTo
     * @param page
     * @param limit
     * @param sortBy
     * @returns any
     * @throws ApiError
     */
    public static listingsControllerFindAll(
        q?: string,
        category?: string,
        minPrice?: number,
        maxPrice?: number,
        lat?: number,
        lng?: number,
        radiusKm: number = 10,
        availableFrom?: string,
        availableTo?: string,
        page: number = 1,
        limit: number = 20,
        sortBy?: 'distance' | 'price_asc' | 'price_desc' | 'date',
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/api/listings',
            query: {
                'q': q,
                'category': category,
                'minPrice': minPrice,
                'maxPrice': maxPrice,
                'lat': lat,
                'lng': lng,
                'radiusKm': radiusKm,
                'availableFrom': availableFrom,
                'availableTo': availableTo,
                'page': page,
                'limit': limit,
                'sortBy': sortBy,
            },
        });
    }
    /**
     * Get listing details
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static listingsControllerFindOne(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/api/listings/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Update listing (host or admin)
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static listingsControllerUpdate(
        id: string,
        requestBody: UpdateListingDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/api/listings/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete listing (host or admin)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static listingsControllerRemove(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/api/listings/{id}',
            path: {
                'id': id,
            },
        });
    }
}
