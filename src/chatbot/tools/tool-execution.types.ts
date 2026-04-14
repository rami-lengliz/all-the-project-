export type ToolExecutionStatus = 
  | 'success'
  | 'validation_error'
  | 'timeout'
  | 'execution_error'
  | 'policy_blocked'
  | 'not_found'
  | 'confirmation_required'
  | 'rate_limited'
  | 'trust_restricted'
  | 'suspicious_activity'
  | 'cooldown_active'
  | 'too_many_failed_confirmations';

export interface GovernedToolResult {
  status: ToolExecutionStatus;
  output?: any;
  errorMessage?: string;
  metadata?: {
    durationMs: number;
    toolName: string;
    [key: string]: any;
  };
}
