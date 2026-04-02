/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateBookingDto = {
    listingId: string;
    startDate: string;
    endDate: string;
    /**
     * Start time for slot bookings (HH:mm format)
     */
    startTime?: string;
    /**
     * End time for slot bookings (HH:mm format)
     */
    endTime?: string;
    /**
     * Optional opening message from renter (shown in chat thread)
     */
    message?: string;
};

