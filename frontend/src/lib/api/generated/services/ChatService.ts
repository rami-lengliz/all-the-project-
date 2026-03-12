/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateConversationDto } from '../models/CreateConversationDto';
import type { MarkAsReadDto } from '../models/MarkAsReadDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ChatService {
    /**
     * Get all conversations for the current user
     * @returns any Returns list of conversations
     * @throws ApiError
     */
    public static chatControllerGetConversations(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/chat/conversations',
        });
    }
    /**
     * Create or get a conversation
     * @param requestBody
     * @returns any Conversation created or retrieved
     * @throws ApiError
     */
    public static chatControllerCreateConversation(
        requestBody: CreateConversationDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat/conversations',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get messages in a conversation
     * @param id
     * @param page
     * @param limit
     * @returns any Returns paginated messages
     * @throws ApiError
     */
    public static chatControllerGetMessages(
        id: string,
        page?: number,
        limit?: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/chat/conversations/{id}/messages',
            path: {
                'id': id,
            },
            query: {
                'page': page,
                'limit': limit,
            },
        });
    }
    /**
     * Mark messages as read
     * @param requestBody
     * @returns any Messages marked as read
     * @throws ApiError
     */
    public static chatControllerMarkAsRead(
        requestBody: MarkAsReadDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/chat/messages/read',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get unread message count
     * @returns any Returns unread count
     * @throws ApiError
     */
    public static chatControllerGetUnreadCount(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/chat/unread-count',
        });
    }
}
