/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateListingDto = {
    title?: string;
    description?: string;
    categoryId?: string;
    /**
     * Price per day in TND
     */
    pricePerDay?: number;
    latitude?: number;
    longitude?: number;
    address?: string;
    rules?: string;
    /**
     * Booking type: DAILY for day-based rentals, SLOT for hourly/time-slot bookings
     */
    bookingType?: UpdateListingDto.bookingType;
    availability?: Array<string>;
    /**
     * Array of image URLs to remove from the listing
     */
    imagesToRemove?: Array<string>;
};
export namespace UpdateListingDto {
    /**
     * Booking type: DAILY for day-based rentals, SLOT for hourly/time-slot bookings
     */
    export enum bookingType {
        DAILY = 'DAILY',
        SLOT = 'SLOT',
    }
}

