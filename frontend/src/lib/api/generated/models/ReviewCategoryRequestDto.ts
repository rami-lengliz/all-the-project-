/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReviewCategoryRequestDto = {
    action: ReviewCategoryRequestDto.action;
    /**
     * Notes from admin regarding the decision
     */
    adminNotes?: string;
    /**
     * If merging, the ID of the category to merge into. If approving, optional ID if creating a new one ahead of time.
     */
    resolvedCategoryId?: string;
};
export namespace ReviewCategoryRequestDto {
    export enum action {
        APPROVED = 'APPROVED',
        REJECTED = 'REJECTED',
        MERGED = 'MERGED',
    }
}

