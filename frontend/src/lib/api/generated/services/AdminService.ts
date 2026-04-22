/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreatePayoutDto } from '../models/CreatePayoutDto';
import type { FlagListingDto } from '../models/FlagListingDto';
import type { MarkPaidDto } from '../models/MarkPaidDto';
import type { MarkTrustReviewedDto } from '../models/MarkTrustReviewedDto';
import type { ModerateListingDto } from '../models/ModerateListingDto';
import type { SuspendListingDto } from '../models/SuspendListingDto';
import type { SuspendUserDto } from '../models/SuspendUserDto';
import type { UnsuspendUserDto } from '../models/UnsuspendUserDto';
import type { UpdateTrustTierDto } from '../models/UpdateTrustTierDto';
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
     * Get single user details for admin review
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetUserDetails(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/users/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Get audit logs for a specific user
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetUserLogs(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/users/{id}/logs',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Suspend a user account (admin only)
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminControllerSuspendUser(
        id: string,
        requestBody: SuspendUserDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/users/{id}/suspend',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Unsuspend a user account (admin only)
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminControllerUnsuspendUser(
        id: string,
        requestBody: UnsuspendUserDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/users/{id}/unsuspend',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get all listings, filterable by status (admin only)
     * @param status
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetAllListings(
        status: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/listings',
            query: {
                'status': status,
            },
        });
    }
    /**
     * Get single listing details for admin review
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetListingDetails(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/listings/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Get audit logs for a specific listing
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetListingLogs(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/listings/{id}/logs',
            path: {
                'id': id,
            },
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
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminControllerApproveListing(
        id: string,
        requestBody: ModerateListingDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/listings/{id}/approve',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Suspend a listing (set status SUSPENDED)
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminControllerSuspendListing(
        id: string,
        requestBody: SuspendListingDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/listings/{id}/suspend',
            path: {
                'id': id,
            },
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
     * Get payout details (admin only)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetPayoutDetails(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/payouts/{id}',
            path: {
                'id': id,
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
    /**
     * Get a queue of suspicious users
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetSuspiciousUsers(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/trust/suspicious',
        });
    }
    /**
     * Get trust profile and security events for a user
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminControllerGetUserTrustProfile(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/users/{id}/trust',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Mark a user trust case as reviewed/cleared
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminControllerMarkTrustReviewed(
        id: string,
        requestBody: MarkTrustReviewedDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/users/{id}/trust/review',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Manually override a user trust tier
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminControllerUpdateTrustTier(
        id: string,
        requestBody: UpdateTrustTierDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/users/{id}/trust/tier',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
