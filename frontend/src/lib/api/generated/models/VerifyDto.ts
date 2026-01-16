/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type VerifyDto = {
    userId: string;
    type: VerifyDto.type;
    code: string;
};
export namespace VerifyDto {
    export enum type {
        EMAIL = 'email',
        PHONE = 'phone',
    }
}

