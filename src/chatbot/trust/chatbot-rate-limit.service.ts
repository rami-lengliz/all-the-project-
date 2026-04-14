import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitCategory, RateLimitResult } from './chatbot-rate-limit.types';

@Injectable()
export class ChatbotRateLimitService {
  private readonly logger = new Logger(ChatbotRateLimitService.name);
  
  // In-memory store: Key: `${userId}:${category}`, Value: array of timestamps
  private requestStore: Map<string, number[]> = new Map();
  // Cooldown store: Key: `${userId}:${category}` or just `${userId}:global`, Value: expiry timestamp
  private cooldownStore: Map<string, number> = new Map();

  constructor(private configService: ConfigService) {}

  private getLimitConfig(category: RateLimitCategory): { limit: number; windowMs: number } {
    // Defaults that should normally be overridden by ConfigService
    let envLimit = 10;
    let envWindowMs = 60000;

    switch (category) {
      case 'chatbot_message_requests':
        envLimit = this.configService.get<number>('CHATBOT_RATE_LIMIT_MESSAGES_PER_MINUTE') || 15;
        envWindowMs = 60 * 1000;
        break;
      case 'chatbot_tool_calls':
        envLimit = this.configService.get<number>('CHATBOT_RATE_LIMIT_TOOL_CALLS_PER_MINUTE') || 30;
        envWindowMs = 60 * 1000;
        break;
      case 'chatbot_mutation_proposals':
        envLimit = this.configService.get<number>('CHATBOT_RATE_LIMIT_MUTATIONS_PER_HOUR') || 10;
        envWindowMs = 60 * 60 * 1000;
        break;
      case 'chatbot_action_confirmations':
        envLimit = this.configService.get<number>('CHATBOT_RATE_LIMIT_CONFIRMATIONS_PER_HOUR') || 10;
        envWindowMs = 60 * 60 * 1000;
        break;
      case 'chatbot_failed_confirmations':
        envLimit = this.configService.get<number>('CHATBOT_MAX_FAILED_CONFIRMATIONS_BEFORE_COOLDOWN') || 3;
        envWindowMs = 30 * 60 * 1000; // Track over 30 mins
        break;
      case 'chatbot_help_or_contact_requests':
        envLimit = 5; // e.g. 5 per hour
        envWindowMs = 60 * 60 * 1000;
        break;
    }
    
    return { limit: envLimit, windowMs: envWindowMs };
  }

  public checkCooldown(userId: string, category?: RateLimitCategory): { active: boolean; expiresAt?: Date; reason?: string } {
    const now = Date.now();
    // Check specific cooldown
    if (category) {
      const key = `${userId}:${category}`;
      const expiry = this.cooldownStore.get(key);
      if (expiry && now < expiry) {
        return { active: true, expiresAt: new Date(expiry), reason: 'cooldown_active' };
      } else if (expiry) {
        this.cooldownStore.delete(key);
      }
    }
    // Check global cooldown
    const globalKey = `${userId}:global`;
    const globalExpiry = this.cooldownStore.get(globalKey);
    if (globalExpiry && now < globalExpiry) {
        return { active: true, expiresAt: new Date(globalExpiry), reason: 'global_cooldown_active' };
    } else if (globalExpiry) {
        this.cooldownStore.delete(globalKey);
    }

    return { active: false };
  }

  public applyCooldown(userId: string, category?: RateLimitCategory, minutesOvr?: number) {
    const minutes = minutesOvr || this.configService.get<number>('CHATBOT_COOLDOWN_MINUTES') || 15;
    const expiry = Date.now() + minutes * 60 * 1000;
    
    if (category) {
       this.cooldownStore.set(`${userId}:${category}`, expiry);
       this.logger.warn(`Applied ${minutes}m cooldown for user ${userId} on category ${category}`);
    } else {
       this.cooldownStore.set(`${userId}:global`, expiry);
       this.logger.warn(`Applied GLOBAL ${minutes}m cooldown for user ${userId}`);
    }
  }

  public async evaluateLimit(
    userId: string,
    category: RateLimitCategory,
    overrideLimit?: number,
    overrideWindowMs?: number
  ): Promise<RateLimitResult> {
    
    const cooldownCheck = this.checkCooldown(userId, category);
    if (cooldownCheck.active) {
      return {
        allowed: false,
        throttleMs: cooldownCheck.expiresAt!.getTime() - Date.now(),
        reason: cooldownCheck.reason,
        cooldownActive: true
      };
    }

    const { limit, windowMs } = {
       limit: overrideLimit ?? this.getLimitConfig(category).limit,
       windowMs: overrideWindowMs ?? this.getLimitConfig(category).windowMs
    };

    const key = `${userId}:${category}`;
    const now = Date.now();
    
    const history = this.requestStore.get(key) || [];
    // Prune old
    const validHistory = history.filter(ts => ts > now - windowMs);
    
    if (validHistory.length >= limit) {
      this.logger.warn(`Rate limit exceeded for user ${userId} on category ${category}`);
      return {
         allowed: false,
         throttleMs: validHistory[0] - (now - windowMs),
         reason: 'rate_limited'
      };
    }

    return { allowed: true, throttleMs: 0 };
  }

  public async recordUsage(userId: string, category: RateLimitCategory) {
     const key = `${userId}:${category}`;
     const now = Date.now();
     const history = this.requestStore.get(key) || [];
     
     const { windowMs } = this.getLimitConfig(category);
     const validHistory = history.filter(ts => ts > now - windowMs);
     validHistory.push(now);
     
     this.requestStore.set(key, validHistory);
  }
}
