/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthorizePaymentDto } from '../models/AuthorizePaymentDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class PaymentsService {
    /**
     * Authorize payment for a booking (renter only)
     * @param bookingId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static paymentsControllerAuthorize(
        bookingId: string,
        requestBody: AuthorizePaymentDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/payments/booking/{bookingId}/authorize',
            path: {
                'bookingId': bookingId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Capture authorized payment (system only)
     * @param bookingId
     * @returns any
     * @throws ApiError
     */
    public static paymentsControllerCapture(
        bookingId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/payments/booking/{bookingId}/capture',
            path: {
                'bookingId': bookingId,
            },
        });
    }
    /**
     * Refund captured payment
     * @param bookingId
     * @returns any
     * @throws ApiError
     */
    public static paymentsControllerRefund(
        bookingId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/payments/booking/{bookingId}/refund',
            path: {
                'bookingId': bookingId,
            },
        });
    }
    /**
     * Cancel payment intent (renter or host, before capture)
     * @param bookingId
     * @returns any
     * @throws ApiError
     */
    public static paymentsControllerCancel(
        bookingId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/payments/booking/{bookingId}/cancel',
            path: {
                'bookingId': bookingId,
            },
        });
    }
    /**
     * Get payment intent for a booking
     * @param bookingId
     * @returns any
     * @throws ApiError
     */
    public static paymentsControllerGetByBooking(
        bookingId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/payments/booking/{bookingId}',
            path: {
                'bookingId': bookingId,
            },
        });
    }
}
