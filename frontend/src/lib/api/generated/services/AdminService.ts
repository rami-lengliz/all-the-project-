/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreatePayoutDto } from '../models/CreatePayoutDto';
import type { FlagListingDto } from '../models/FlagListingDto';
import type { MarkPaidDto } from '../models/MarkPaidDto';
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
            url: '/api/admin/users',
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
            url: '/api/admin/listings',
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
            url: '/api/admin/flag',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Approve a listing (set status ACTIVE)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerApproveListing(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/listings/{id}/approve',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Suspend a listing (set status SUSPENDED)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerSuspendListing(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/listings/{id}/suspend',
            path: {
                'id': id,
            },
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
            url: '/api/admin/logs',
            query: {
                'limit': limit,
            },
        });
    }
    /**
     * Ledger summary totals (admin only)
     * @param from
     * @param to
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetLedgerSummary(
        from: string,
        to: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/ledger/summary',
            query: {
                'from': from,
                'to': to,
            },
        });
    }
    /**
     * Host payout balance (admin only)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetHostBalance(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/hosts/{id}/balance',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Ledger entries for a booking (admin only)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetBookingLedger(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/bookings/{id}/ledger',
            path: {
                'id': id,
            },
        });
    }
    /**
     * List payouts, optionally filter by status (admin only)
     * @param status
     * @param page
     * @param limit
     * @returns any
     * @throws ApiError
     */
    public static adminControllerListPayouts(
        status: string,
        page: number,
        limit: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/payouts',
            query: {
                'status': status,
                'page': page,
                'limit': limit,
            },
        });
    }
    /**
     * Create a payout for a host (admin only)
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminControllerCreatePayout(
        id: string,
        requestBody: CreatePayoutDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/hosts/{id}/payouts',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Mark a payout as PAID and post ledger DEBIT (admin only)
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminControllerMarkPayoutPaid(
        id: string,
        requestBody: MarkPaidDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/payouts/{id}/mark-paid',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Open a dispute on a booking (admin only)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerOpenDispute(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/bookings/{id}/dispute/open',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Resolve a dispute on a booking (admin only)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerResolveDispute(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/bookings/{id}/dispute/resolve',
            path: {
                'id': id,
            },
        });
    }
}
