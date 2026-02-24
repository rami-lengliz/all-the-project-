/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateBookingDto } from '../models/CreateBookingDto';
import type { PayBookingDto } from '../models/PayBookingDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class BookingsService {
    /**
     * Create a new booking
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static bookingsControllerCreate(
        requestBody: CreateBookingDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/bookings',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get user bookings
     * @returns any
     * @throws ApiError
     */
    public static bookingsControllerFindAll(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/bookings/me',
        });
    }
    /**
     * Get booking details
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static bookingsControllerFindOne(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/bookings/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Confirm booking (host only)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static bookingsControllerConfirm(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/bookings/{id}/confirm',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Simulate payment for booking
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static bookingsControllerPay(
        id: string,
        requestBody: PayBookingDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/bookings/{id}/pay',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Cancel booking
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static bookingsControllerCancel(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/bookings/{id}/cancel',
            path: {
                'id': id,
            },
        });
    }
}

