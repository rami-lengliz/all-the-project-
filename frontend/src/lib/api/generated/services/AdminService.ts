/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FlagListingDto } from '../models/FlagListingDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AdminService {
    /**
     * Get all users (admin only)
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetAllUsers(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/api/admin/users',
        });
    }
    /**
     * Get all listings (admin only)
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetAllListings(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/api/admin/listings',
        });
    }
    /**
     * Flag a listing for review (admin only)
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminControllerFlagListing(
        requestBody: FlagListingDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/api/admin/flag',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get admin action logs (admin only)
     * @param limit
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetLogs(
        limit: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/api/admin/logs',
            query: {
                'limit': limit,
            },
        });
    }
}
