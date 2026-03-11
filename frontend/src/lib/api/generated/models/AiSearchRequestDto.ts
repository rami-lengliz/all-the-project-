/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AiSearchRequestDto = {
    /**
     * User search query in natural language
     */
    query: string;
    /**
     * User latitude
     */
    lat?: number;
    /**
     * User longitude
     */
    lng?: number;
    /**
     * Search radius in kilometers
     */
    radiusKm?: number;
    /**
     * Available category slugs within radius (optional)
     */
    availableCategorySlugs?: Array<string>;
    /**
     * Whether a follow-up question has already been used
     */
    followUpUsed?: boolean;
    /**
     * Answer to previous follow-up question
     */
    followUpAnswer?: string;
};

