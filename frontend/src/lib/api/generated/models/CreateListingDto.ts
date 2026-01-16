/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateListingDto = {
    title: string;
    description: string;
    categoryId: string;
    /**
     * Price per day in TND
     */
    pricePerDay: number;
    latitude: number;
    longitude: number;
    address: string;
    rules?: string;
    availability?: Array<string>;
};

