/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LoginDto } from '../models/LoginDto';
import type { RefreshTokenDto } from '../models/RefreshTokenDto';
import type { RegisterDto } from '../models/RegisterDto';
import type { VerifyDto } from '../models/VerifyDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * Register a new user
     * @param requestBody
     * @returns any User registered successfully
     * @throws ApiError
     */
    public static authControllerRegister(
        requestBody: RegisterDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/api/auth/register',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Login user
     * @param requestBody
     * @returns any Login successful
     * @throws ApiError
     */
    public static authControllerLogin(
        requestBody: LoginDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/api/auth/login',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Refresh access token
     * @param requestBody
     * @returns any Token refreshed successfully
     * @throws ApiError
     */
    public static authControllerRefresh(
        requestBody: RefreshTokenDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/api/auth/refresh',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Verify email or phone
     * @param requestBody
     * @returns any Verification successful
     * @throws ApiError
     */
    public static authControllerVerify(
        requestBody: VerifyDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/api/auth/verify',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
