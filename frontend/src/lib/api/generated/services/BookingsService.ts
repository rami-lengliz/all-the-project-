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
     * Create a new booking request (status → pending)
     * @param requestBody
     * @returns any Booking created. displayStatus = "pending". A pending booking does NOT block availability for other renters.
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
            errors: {
                409: `Listing is not available for requested dates/slots.`,
            },
        });
    }
    /**
     * Get all bookings for the current user
     * @returns any Each booking includes a `displayStatus` field: pending | accepted | completed | canceled | rejected.
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
     * @returns any Booking object with `displayStatus` field.
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
     * Host accepts a pending booking (internal: confirmed → displayStatus: accepted)
     * Accepting a booking locks the availability of the listing. Any other overlapping bookings cannot be accepted once this lock is made. Executed inside an atomic DB transaction to prevent double bookings.
     * @param id
     * @returns any Booking internal status set to `confirmed`. displayStatus = "accepted".
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
            errors: {
                409: `Cannot confirm: Another confirmed/paid booking overlaps with this date or time slot.`,
            },
        });
    }
    /**
     * Host rejects a pending booking (internal: rejected → displayStatus: rejected)
     * Only the host of the listing can reject a booking. Only `pending` bookings can be rejected. Once rejected, the slot is freed for other renters.
     * @param id
     * @returns any Booking internal status set to `rejected`. displayStatus = "rejected".
     * @throws ApiError
     */
    public static bookingsControllerReject(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/bookings/{id}/reject',
            path: {
                'id': id,
            },
            errors: {
                400: `Booking is not in pending state.`,
                403: `Only the host can reject bookings.`,
            },
        });
    }
    /**
     * Simulate payment for a confirmed booking (internal: paid → displayStatus: accepted)
     * @param id
     * @param requestBody
     * @returns any Payment processed. displayStatus stays "accepted" (paid is an internal milestone).
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
     * Renter or host cancels a booking (internal: cancelled → displayStatus: canceled)
     * @param id
     * @returns any Booking cancelled. displayStatus = "canceled".
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
