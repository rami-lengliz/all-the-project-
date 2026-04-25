/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateMessageDto } from '../models/CreateMessageDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ChatbotService {
    /**
     * Send a message to the chatbot
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static chatbotControllerSendMessage(
        requestBody: CreateMessageDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chatbot/messages',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get all chatbot conversations for current user
     * @returns any
     * @throws ApiError
     */
    public static chatbotControllerGetConversations(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/chatbot/conversations',
        });
    }
    /**
     * Get all messages in a specific conversation
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static chatbotControllerGetConversationMessages(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/chatbot/conversations/{id}/messages',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Confirm a pending chatbot mutation action securely
     * @returns any
     * @throws ApiError
     */
    public static chatbotControllerConfirmAction(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chatbot/actions/confirm',
        });
    }
}
