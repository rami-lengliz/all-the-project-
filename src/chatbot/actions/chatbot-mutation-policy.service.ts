import { Injectable } from '@nestjs/common';

export interface MutationPolicyResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reasonCode?: string;
}

@Injectable()
export class ChatbotMutationPolicyService {
  private readonly MUTATION_TOOLS = [
    'contact_host_about_booking',
    'request_booking_help',
    'cancel_my_booking_if_allowed',
    'create_support_ticket_from_chat' // Optional inclusion
  ];

  public isMutationTool(toolName: string): boolean {
    return this.MUTATION_TOOLS.includes(toolName);
  }

  public evaluateMutationPolicy(toolName: string): MutationPolicyResult {
    if (!this.isMutationTool(toolName)) {
       return { allowed: false, requiresConfirmation: false, reasonCode: 'NOT_A_RECOGNIZED_MUTATION' };
    }

    // ALL mutations require explicit two-step confirmation safely per constraints.
    return {
      allowed: true,
      requiresConfirmation: true
    };
  }
}
