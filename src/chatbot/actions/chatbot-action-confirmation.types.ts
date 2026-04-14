export interface ChatbotMutationProposal {
  actionName: string;
  arguments: any;
  resourceId?: string;
  resourceType?: string;
}

export interface ChatbotConfirmationState {
  id: string;
  userId: string;
  conversationId: string;
  actionName: string;
  resourceId?: string;
  resourceType?: string;
  token: string;
  status: 'pending' | 'confirmed' | 'expired' | 'consumed' | 'cancelled';
  expiresAt: Date;
  payloadHash: string;
}
