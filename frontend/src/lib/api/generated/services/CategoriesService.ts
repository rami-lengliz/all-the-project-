/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateCategoryDto } from '../models/CreateCategoryDto';
import type { CreateCategoryRequestDto } from '../models/CreateCategoryRequestDto';
import type { ReviewCategoryRequestDto } from '../models/ReviewCategoryRequestDto';
import type { UpdateCategoryDto } from '../models/UpdateCategoryDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CategoriesService {
    /**
     * Create category (admin only)
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static categoriesControllerCreate(
        requestBody: CreateCategoryDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/categories',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * List active categories
     * @returns any
     * @throws ApiError
     */
    public static categoriesControllerFindAll(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/categories',
        });
    }
    /**
     * List all categories including inactive (admin only)
     * @returns any
     * @throws ApiError
     */
    public static categoriesControllerFindAllAdmin(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/categories/admin/all',
        });
    }
    /**
     * Get nearby categories with listing counts
     * Returns categories that have active listings within the specified radius from a geographic location. Uses PostGIS for accurate geospatial queries. Results are ordered by listing count (descending) then category name (ascending). Only includes active, non-deleted listings with valid location data.
     * @param lat Latitude coordinate (-90 to 90)
     * @param lng Longitude coordinate (-180 to 180)
     * @param radiusKm Search radius in kilometers (0-50, default: 10)
     * @param includeEmpty Include categories with zero listings (default: false)
     * @returns any Categories with listing counts successfully retrieved
     * @throws ApiError
     */
    public static categoriesControllerFindNearby(
        lat: number,
        lng: number,
        radiusKm: number = 10,
        includeEmpty: boolean = false,
    ): CancelablePromise<{
        success?: boolean;
        data?: Array<{
            /**
             * Category UUID
             */
            id?: string;
            /**
             * Category name
             */
            name?: string;
            /**
             * URL-friendly category identifier
             */
            slug?: string;
            /**
             * Icon identifier (FontAwesome class)
             */
            icon?: string | null;
            /**
             * Number of active listings within radius
             */
            count?: number;
        }>;
        timestamp?: string;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/categories/nearby',
            query: {
                'lat': lat,
                'lng': lng,
                'radiusKm': radiusKm,
                'includeEmpty': includeEmpty,
            },
        });
    }
    /**
     * Get category by ID
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static categoriesControllerFindOne(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/categories/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Update category (admin only)
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static categoriesControllerUpdate(
        id: string,
        requestBody: UpdateCategoryDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/categories/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete category (admin only)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static categoriesControllerRemove(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/categories/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Submit a request for a new category (Hosts)
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static categoriesControllerCreateRequest(
        requestBody: CreateCategoryRequestDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/categories/requests',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * List all category requests (Admin only)
     * @param status
     * @returns any
     * @throws ApiError
     */
    public static categoriesControllerFindAllRequests(
        status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'MERGED',
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/categories/admin/requests',
            query: {
                'status': status,
            },
        });
    }
    /**
     * Get details of a category request (Admin only)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static categoriesControllerGetRequestById(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/categories/admin/requests/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Review and action a category request (Admin only)
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static categoriesControllerReviewRequest(
        id: string,
        requestBody: ReviewCategoryRequestDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/categories/admin/requests/{id}/review',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
