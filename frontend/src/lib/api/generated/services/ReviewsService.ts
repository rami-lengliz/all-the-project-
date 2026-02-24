/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateReviewDto } from '../models/CreateReviewDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ReviewsService {
    /**
     * Create a review
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static reviewsControllerCreate(
        requestBody: CreateReviewDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/reviews',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get reviews for a user
     * @param userId
     * @returns any
     * @throws ApiError
     */
    public static reviewsControllerFindByUser(
        userId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/reviews/user/{userId}',
            path: {
                'userId': userId,
            },
        });
    }
    /**
     * Get review details
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static reviewsControllerFindOne(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/reviews/{id}',
            path: {
                'id': id,
            },
        });
    }
}

