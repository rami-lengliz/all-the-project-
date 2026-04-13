/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateListingDto = {
    title: string;
    description: string;
    categoryId: string;
    /**
     * Price per day in TND — required at publish step, not before.
     */
    pricePerDay?: number;
    latitude: number;
    longitude: number;
    address: string;
    rules?: string;
    /**
     * Booking type: DAILY for day-based rentals, SLOT for hourly/time-slot bookings
     */
    bookingType?: CreateListingDto.bookingType;
    availability?: Array<string>;
};
export namespace CreateListingDto {
    /**
     * Booking type: DAILY for day-based rentals, SLOT for hourly/time-slot bookings
     */
    export enum bookingType {
        DAILY = 'DAILY',
        SLOT = 'SLOT',
    }
}

