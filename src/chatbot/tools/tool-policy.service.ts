import { Injectable } from '@nestjs/common';

@Injectable()
export class ToolPolicyService {
  /**
   * Defines which tools are permitted to run in the current context.
   * Can be expanded with context/roles (e.g. admin vs client).
   */
  public getAllowedToolNames(context?: any): string[] {
    return ['search_listings']; // Hardcoded for this iteration
  }
}
