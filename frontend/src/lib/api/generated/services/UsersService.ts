/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BecomeHostDto } from '../models/BecomeHostDto';
import type { UpdateUserDto } from '../models/UpdateUserDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class UsersService {
    /**
     * Get current user profile
     * @returns any
     * @throws ApiError
     */
    public static usersControllerGetProfile(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/api/users/me',
        });
    }
    /**
     * Update current user profile
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static usersControllerUpdateProfile(
        requestBody: UpdateUserDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/api/users/me',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Become a host
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static usersControllerBecomeHost(
        requestBody: BecomeHostDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/api/users/me/become-host',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get user public profile
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static usersControllerFindOne(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/api/users/{id}',
            path: {
                'id': id,
            },
        });
    }
}
