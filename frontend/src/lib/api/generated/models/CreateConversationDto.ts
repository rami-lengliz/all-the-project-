/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateConversationDto = {
    /**
     * ID of the other user in the conversation
     */
    otherUserId: string;
    /**
     * Optional booking ID to link conversation to
     */
    bookingId?: string;
    /**
     * Optional listing ID to link conversation to
     */
    listingId?: string;
};

