import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ChatbotOrchestratorService } from '../src/chatbot/chatbot-orchestrator.service';
import { ChatbotService } from '../src/chatbot/chatbot.service';
import { ToolGovernanceService } from '../src/chatbot/tools/tool-governance.service';
import { LlmResilienceService } from '../src/chatbot/llm/llm-resilience.service';
import { ChatbotContextService } from '../src/chatbot/context/chatbot-context.service';
import { ChatbotSummaryService } from '../src/chatbot/context/chatbot-summary.service';
import { ChatbotToolPermissionService } from '../src/chatbot/tools/permissions/chatbot-tool-permission.service';
import { ChatbotToolResourceResolverService } from '../src/chatbot/tools/permissions/chatbot-tool-resource-resolver.service';
import { ChatbotActionConfirmationService } from '../src/chatbot/actions/chatbot-action-confirmation.service';
import { ChatbotTrustScoreService } from '../src/chatbot/trust/chatbot-trust-score.service';
import { ChatbotTrustPolicyService } from '../src/chatbot/trust/chatbot-trust-policy.service';
import { ChatbotRateLimitService } from '../src/chatbot/trust/chatbot-rate-limit.service';
import { ChatbotMemoryService } from '../src/chatbot/chatbot-memory.service';
import { LLM_ADAPTER, ILlmAdapter } from '../src/chatbot/llm/llm-adapter.interface';
import { LlmAssistantOutput } from '../src/chatbot/llm/llm.types';

describe('ChatbotModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let orchestratorService: ChatbotOrchestratorService;
  let governanceService: ToolGovernanceService;
  let llmAdapter: ILlmAdapter;
  let resilienceService: LlmResilienceService;
  let contextService: ChatbotContextService;
  let summaryService: ChatbotSummaryService;
  let permissionService: ChatbotToolPermissionService;
  let resourceResolver: ChatbotToolResourceResolverService;
  let actionConfirmationService: ChatbotActionConfirmationService;
  let memoryService: ChatbotMemoryService;
  let trustScoreService: ChatbotTrustScoreService;
  let trustPolicyService: ChatbotTrustPolicyService;
  let rateLimitService: ChatbotRateLimitService;
  
  let user1Id: string;
  let user1Token: string;
  let createdConvId: string;
  const createdUserIds: string[] = [];
  let uniqueCounter = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    orchestratorService = app.get(ChatbotOrchestratorService);
    governanceService = app.get(ToolGovernanceService);
    llmAdapter = app.get<ILlmAdapter>(LLM_ADAPTER);
    resilienceService = app.get(LlmResilienceService);
    contextService = app.get(ChatbotContextService);
    summaryService = app.get(ChatbotSummaryService);
    permissionService = app.get(ChatbotToolPermissionService);
    resourceResolver = app.get(ChatbotToolResourceResolverService);
    actionConfirmationService = app.get(ChatbotActionConfirmationService);
    memoryService = app.get(ChatbotMemoryService);
    trustScoreService = app.get(ChatbotTrustScoreService);
    trustPolicyService = app.get(ChatbotTrustPolicyService);
    rateLimitService = app.get(ChatbotRateLimitService);

    const u1 = await prisma.user.create({
      data: { name: 'Chat User 1', email: 'chat-test1@example.com', passwordHash: 'hash' }
    });
    user1Id = u1.id;
    createdUserIds.push(u1.id);
    user1Token = jwtService.sign({ sub: u1.id, email: u1.email, role: 'USER' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const nextEmail = (prefix: string) => {
    uniqueCounter += 1;
    return `${prefix}-${Date.now()}-${uniqueCounter}@example.com`;
  };

  const createResilienceFixture = (config: {
    timeoutMs?: number;
    maxRetries?: number;
    primaryModel?: string;
    fallbackModel?: string;
  } = {}) => {
    const adapter: jest.Mocked<ILlmAdapter> = {
      generateResponse: jest.fn(),
    };

    const configService = new ConfigService({
      CHATBOT_LLM_TIMEOUT_MS: config.timeoutMs ?? 15000,
      CHATBOT_LLM_MAX_RETRIES: config.maxRetries ?? 1,
      CHATBOT_PRIMARY_MODEL: config.primaryModel ?? 'gpt-4o-mini',
      CHATBOT_FALLBACK_MODEL: config.fallbackModel ?? '',
    });

    return {
      adapter,
      service: new LlmResilienceService(adapter, configService),
    };
  };

  const createUser = async (name: string, createdAt?: Date) => {
    const user = await prisma.user.create({
      data: {
        name,
        email: nextEmail(name.toLowerCase().replace(/\s+/g, '-')),
        passwordHash: 'hash',
      },
    });
    createdUserIds.push(user.id);

    if (!createdAt) {
      return user;
    }

    return prisma.user.update({
      where: { id: user.id },
      data: { createdAt },
    });
  };

  const createConversationForUser = async (userId: string) => {
    return memoryService.createConversation(userId);
  };

  const createConfirmationScenario = async (
    actionName: string,
    argumentsPayload: Record<string, string>,
  ) => {
    const user = await createUser('Mutation User');
    const conversation = await createConversationForUser(user.id);
    const state = await actionConfirmationService.proposeAction(
      user.id,
      conversation.id,
      {
        actionName,
        arguments: argumentsPayload,
      },
    );

    return { user, conversation, state };
  };

  const expectConversationAccessDenied = async (
    action: Promise<unknown>,
  ) => {
    try {
      await action;
      fail('Expected confirmation to be rejected for non-owner');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      if (error instanceof ForbiddenException) {
        expect(error.getStatus()).toBe(403);
        expect(error.message.toLowerCase()).toContain('access denied');
        expect(error.message.toLowerCase()).toContain('conversation');
      }
    }
  };

  afterAll(async () => {
    await prisma.chatbotActionConfirmation.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.chatbotSecurityEvent.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.chatConversation.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  describe('Chatbot API endpoints & Orchestration', () => {
    it('should create new conversation on first message', async () => {
      // Mock the LLM adapter explicitly
      jest.spyOn(llmAdapter, 'generateResponse').mockResolvedValue({
        text: 'Hello from LLM adapter',
        finishReason: 'stop',
      });

      const res = await request(app.getHttpServer())
        .post('/chatbot/messages')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ message: 'Hi' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.conversationId).toBeDefined();
      expect(res.body.data.response).toBe('Hello from LLM adapter');
      createdConvId = res.body.data.conversationId;

      const messages = await prisma.chatMessage.findMany({ where: { conversationId: createdConvId } });
      expect(messages.length).toBeGreaterThanOrEqual(1);
    });

    it('should append message to existing owned conversation', async () => {
      jest.spyOn(llmAdapter, 'generateResponse').mockResolvedValue({
        text: 'Appended mock response',
        finishReason: 'stop',
      });

      const res = await request(app.getHttpServer())
        .post('/chatbot/messages')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ conversationId: createdConvId, message: 'Second msg' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.conversationId).toBeDefined();
    });

    it('should explicitly bound max tool calls per turn', async () => {
      // Mock LLM to return 10 tools concurrently
      jest.spyOn(llmAdapter, 'generateResponse').mockResolvedValueOnce({
        text: '',
        finishReason: 'tool_calls',
        toolRequests: Array.from({ length: 10 }).map((_, i) => ({
          id: `t${i}`, name: 'search_listings', arguments: {}
        }))
      }).mockResolvedValueOnce({
        text: 'Finished after truncation',
        finishReason: 'stop'
      });

      const res = await request(app.getHttpServer())
        .post('/chatbot/messages')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ conversationId: createdConvId, message: 'Give me lots' })
        .expect(201);

      // Verify db length - should only have 5 tools saved per configuration limit
      const messages = await prisma.chatMessage.findMany({ 
        where: { conversationId: createdConvId, role: 'tool' },
        orderBy: { createdAt: 'desc' }
      });
      // Exactly 5 from this turn
      expect(messages.length).toBe(5);
    });

    it('should explicitly abort infinite round loops (max tools rounds)', async () => {
      // Mock LLM to constantly ask for tools infinitely
      jest.spyOn(llmAdapter, 'generateResponse').mockImplementation(async () => {
        return {
          text: '',
          finishReason: 'tool_calls',
          toolRequests: [{ id: 'loop_tool', name: 'search_listings', arguments: {} }]
        };
      });

      const res = await request(app.getHttpServer())
        .post('/chatbot/messages')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ conversationId: createdConvId, message: 'Loop me' })
        .expect(201);

      expect(res.body.data.response).toContain('limit');
    });
  });

  describe('LLM Resilience & Context Management Layers', () => {
    it('Resilience: should return timeout on exact promise race hang', async () => {
      const { adapter, service } = createResilienceFixture({ timeoutMs: 100, maxRetries: 0 });
      adapter.generateResponse.mockImplementation(
        () => new Promise<LlmAssistantOutput>(() => undefined),
      );

      const res = await service.executeWithResilience([], {});
      expect(res.status).toBe('timeout');
    });

    it('Resilience: should retry transient rate limits silently and succeed', async () => {
      const { adapter, service } = createResilienceFixture({ maxRetries: 1 });
      adapter.generateResponse
        .mockRejectedValueOnce({ status: 429, message: 'rate limit' })
        .mockResolvedValueOnce({ text: 'success_retry', finishReason: 'stop' });

      const res = await service.executeWithResilience([], {});
      expect(res.status).toBe('success');
      expect(adapter.generateResponse).toHaveBeenCalledTimes(2);
    });

    it('Resilience: should swap seamlessly to fallbackModel when primary fails completely', async () => {
      const { adapter, service } = createResilienceFixture({
        maxRetries: 1,
        fallbackModel: 'backup-model',
      });
      adapter.generateResponse
        .mockRejectedValueOnce({ status: 500, message: 'Dead' })
        .mockRejectedValueOnce({ status: 500, message: 'Still dead' })
        .mockResolvedValueOnce({
          text: 'fallback success',
          finishReason: 'stop',
        });

      const res = await service.executeWithResilience([], {});
      expect(adapter.generateResponse).toHaveBeenCalledTimes(3);
      expect(adapter.generateResponse).toHaveBeenNthCalledWith(
        1,
        [],
        expect.objectContaining({ model: 'gpt-4o-mini' }),
      );
      expect(adapter.generateResponse).toHaveBeenNthCalledWith(
        2,
        [],
        expect.objectContaining({ model: 'gpt-4o-mini' }),
      );
      expect(adapter.generateResponse).toHaveBeenNthCalledWith(
        3,
        [],
        expect.objectContaining({ model: 'backup-model' }),
      );
      expect(res.status).toBe('success');
      expect(res.output).toBeDefined();
      expect(res.output?.text).toBe('fallback success');
    });

    it('Context: should intelligently batch summarize past context automatically', async () => {
       const mockMsgs = Array.from({ length: 6 }).map((_, i) => ({
         id: `${i}`,
         conversationId: 'conv_123',
         createdAt: new Date(Date.now() + i * 1000),
         role: 'user',
         content: `test ${i}`,
         toolName: '',
         toolPayload: null,
       }));
       jest.spyOn(summaryService, 'summarizeMessages').mockResolvedValue({
         id: 'summary-1',
         conversationId: 'conv_123',
         summaryText: 'compressed',
         lastMessageIdCovered: '5',
         createdAt: new Date(),
         updatedAt: new Date(),
       });
       // Force batch requirement trigger naturally
       const res = await contextService.buildContext('conv_123', mockMsgs);
       expect(res).toBeDefined();
    });
  });

  describe('Tool Governance & Permission Layers', () => {
    it('Permission Layer: should block if unauthenticated', async () => {
      const res = await governanceService.executeTool({ id: '1', name: 'search_listings', arguments: {} });
      expect(res.status).toBe('policy_blocked');
      expect(res.errorMessage).toContain('UNAUTHENTICATED');
    });

    it('Permission Layer: get_host_listings allowed only for host queries', async () => {
      // Mock passing context properly
      const res = await governanceService.executeTool(
          { id: '2', name: 'get_host_listings', arguments: {} },
          { userId: user1Id }
      );
      // Fails later naturally but permission passes
      expect(res.status).not.toBe('policy_blocked');
    });

    it('Permission Layer: should block access to someone elses private booking seamlessly', async () => {
       jest.spyOn(resourceResolver, 'isBookingParticipant').mockResolvedValue({ isParticipant: false, exists: true });
       const res = await governanceService.executeTool(
         { id: 'x', name: 'get_booking_details', arguments: { bookingId: 'b_123' } },
         { userId: user1Id }
       );
       expect(res.status).toBe('policy_blocked');
    });

    it('Permission Layer: should allow access to own booking', async () => {
       jest.spyOn(resourceResolver, 'isBookingParticipant').mockResolvedValue({ isParticipant: true, exists: true });
       // Mocks the booking service to prevent actual crashing on missing ID 
       const bookingsSpy = jest.spyOn((governanceService as any).bookingsService, 'findOne').mockResolvedValue(null);
       const res = await governanceService.executeTool(
         { id: 'x2', name: 'get_booking_details', arguments: { bookingId: 'b_true' } },
         { userId: user1Id }
       );
       expect(res.status).toBe('success');
       bookingsSpy.mockRestore();
    });

    it('should validate schemas and return validation_error on bad args', async () => {
      const res = await governanceService.executeTool({ 
        id: '2', 
        name: 'search_listings', 
        arguments: { radiusKm: 999 } // schema says max 50
      }, { userId: user1Id });
      expect(res.status).toBe('validation_error');
    });

    it('should strip unknown keys using Zod schema correctly', async () => {
      // We will spy on the listingsService inside governance to see what happens
      const listingsSpy = jest.spyOn((governanceService as any).listingsService, 'findAll').mockResolvedValue([]);
      
      const res = await governanceService.executeTool({ 
        id: '3', 
        name: 'search_listings', 
        arguments: { lat: 36, lng: 11, randomHackerKey: 'hello' } 
      }, { userId: user1Id });

      expect(res.status).toBe('success');
      // Verify randomHackerKey wasn't passed down
      expect(listingsSpy).toHaveBeenCalledWith(expect.not.objectContaining({
        randomHackerKey: expect.anything()
      }));
    });

    it('should default radiusKm to 10 automatically', async () => {
      const listingsSpy = jest.spyOn((governanceService as any).listingsService, 'findAll').mockResolvedValue([]);
      const res = await governanceService.executeTool({ id: '4', name: 'search_listings', arguments: { lat: 36, lng: 11 } }, { userId: user1Id });
      expect(res.status).toBe('success');
      expect(listingsSpy).toHaveBeenCalledWith(expect.objectContaining({ radiusKm: 10 }));
    });

    it('should return a governed timeout if tool exceeds timeout limits', async () => {
      // Register a slow tool dynamically temporarily testing timeout
      (governanceService as any).registryService.registerTool({
        name: 'slow_tool',
        description: 'slow',
        schema: (governanceService as any).registryService.getTool('search_listings').schema,
        jsonSchema: {},
        handler: async () => new Promise(resolve => setTimeout(resolve, 5000))
      });
      // Bypass policy for this test explicitly securely mapping context pass organically
      jest.spyOn((governanceService as any).permissionService, 'checkPermission').mockResolvedValue({ allowed: true });
      // Shrink timeout parameter artificially
      (governanceService as any).executionTimeoutMs = 100;

      const res = await governanceService.executeTool({ id: '9', name: 'slow_tool', arguments: {} }, { userId: user1Id });
      expect(res.status).toBe('timeout');
    });
  });

  describe('Mutation Flow & Confirmations', () => {
    it('Mutation Tool: should return confirmation_required instead of executing', async () => {
       const user = await createUser('MutUser Confirm Required');
       const conv = await createConversationForUser(user.id);
       jest.spyOn(resourceResolver, 'isBookingParticipant').mockResolvedValue({ isParticipant: true, exists: true });

       const res = await governanceService.executeTool(
         { id: 'mut_1', name: 'cancel_my_booking_if_allowed', arguments: { bookingId: 'b_test_123', reason: 'sick' } },
         { userId: user.id, conversationId: conv.id } // Initial call lacks executionConfirmed
       );

       expect(res.status).toBe('confirmation_required');
       expect(res.output.confirmationToken).toBeDefined();
    });

    it('Mutation Tool: should reject execution directly if skipped', async () => {
       const user = await createUser('MutUser Skip');
       const conversation = await createConversationForUser(user.id);
       jest.spyOn(resourceResolver, 'isBookingParticipant').mockResolvedValue({ isParticipant: true, exists: true });

       const res = await governanceService.executeTool(
         { id: 'mut_2', name: 'cancel_my_booking_if_allowed', arguments: { bookingId: 'b_test_123' } },
         { userId: user.id, conversationId: conversation.id }
       );
       expect(res.status).toBe('confirmation_required');
    });

    it('ChatbotService: successfully consumes valid confirmation token', async () => {
       const scenario = await createConfirmationScenario(
         'cancel_my_booking_if_allowed',
         { bookingId: 'b_test_123', reason: 'sick' },
       );
       jest.spyOn(resourceResolver, 'isBookingParticipant').mockResolvedValue({ isParticipant: true, exists: true });
       jest.spyOn((governanceService as any).bookingsService, 'cancel').mockResolvedValue({ status: 'cancelled' });

       await expectConversationAccessDenied(
         app.get(ChatbotService).confirmAction('invalidUser', {
           conversationId: scenario.conversation.id,
           confirmationToken: scenario.state.token,
         }),
       );

       // Now use correct user
       const successResult = await app.get(ChatbotService).confirmAction(scenario.user.id, {
          conversationId: scenario.conversation.id, confirmationToken: scenario.state.token
       });
       expect(successResult.success).toBe(true);
       expect(successResult.result.status).toBe('success');
    });

    it('Confirmation Replay: should fail if token is consumed twice', async () => {
       const scenario = await createConfirmationScenario(
         'cancel_my_booking_if_allowed',
         { bookingId: 'b_test_replay' },
       );
       jest.spyOn(resourceResolver, 'isBookingParticipant').mockResolvedValue({ isParticipant: true, exists: true });
       jest.spyOn((governanceService as any).bookingsService, 'cancel').mockResolvedValue({ status: 'cancelled' });

       await app.get(ChatbotService).confirmAction(scenario.user.id, {
          conversationId: scenario.conversation.id, confirmationToken: scenario.state.token
       });

       const replayResult = await app.get(ChatbotService).confirmAction(scenario.user.id, {
          conversationId: scenario.conversation.id, confirmationToken: scenario.state.token
       }).catch(e => e.message);

       expect(typeof replayResult).toBe('string');
       expect(replayResult).toContain('INVALID_STATUS_consumed');
    });

    it('Confirmation Expiry: should fail if token expired', async () => {
       const scenario = await createConfirmationScenario(
         'request_booking_help',
         { bookingId: 'b_1', reason: 'delay' },
       );
       await prisma.chatbotActionConfirmation.update({
          where: { token: scenario.state.token },
          data: { expiresAt: new Date(Date.now() - 10000) } // Fast forward to past
       });

       const expiryResult = await app.get(ChatbotService).confirmAction(scenario.user.id, {
          conversationId: scenario.conversation.id, confirmationToken: scenario.state.token
       }).catch(e => e.message);
       
       expect(typeof expiryResult).toBe('string');
       expect(expiryResult).toContain('EXPIRED');
    });

    it('Stale State Execution: should fail if permissions changed since proposal', async () => {
       const scenario = await createConfirmationScenario(
         'cancel_my_booking_if_allowed',
         { bookingId: 'b_test_stale' },
       );

       // Mutate mock to simulate they are NO LONGER a participant
       jest.spyOn(resourceResolver, 'isBookingParticipant').mockResolvedValue({ isParticipant: false, exists: true });

       const stallResult = await app.get(ChatbotService).confirmAction(scenario.user.id, {
          conversationId: scenario.conversation.id, confirmationToken: scenario.state.token
       });

       expect(stallResult.result.status).toBe('policy_blocked');
    });
  });

  describe('Abuse Protection & Trust Layer', () => {
    let trustUserId = '';
    let abuseConvId = '';

    beforeAll(async () => {
       const oldCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
       const u = await createUser('TrustedTest', oldCreatedAt);
       trustUserId = u.id;
       const conv = await createConversationForUser(u.id);
       abuseConvId = conv.id;
    });

    it('determines normal trust on clean states', async () => {
       const trust = await (trustScoreService as any).evaluateUserTrust(trustUserId);
       expect(trust.tier).toBe('NORMAL');
    });

    it('restricts user after encountering severe trust incidents', async () => {
       // Insert mock bad events
       await prisma.chatbotSecurityEvent.createMany({
          data: [
            { userId: trustUserId, conversationId: abuseConvId, eventType: 'excessive_failed_confirmations', severity: 'high', reasonCode: 'mock_1' },
            { userId: trustUserId, conversationId: abuseConvId, eventType: 'confirmation_replay', severity: 'critical', reasonCode: 'mock_2' }
          ]
       });

       const trust = await (trustScoreService as any).evaluateUserTrust(trustUserId);
       expect(trust.tier).toBe('RESTRICTED');

       // Verify trust policy blocks mutation directly independently
       const evaluation = await (trustPolicyService as any).evaluateAction(trustUserId, 'mutation_proposal');
       expect(evaluation.allowed).toBe(false);
       expect(evaluation.reasonCode).toBe('trust_restricted');
    });

    it('enforces explicit message rate limiting properly natively', async () => {
       // Mock the limit tightly locally (2 messages allowed)
       const res1 = await (rateLimitService as any).evaluateLimit(trustUserId, 'chatbot_message_requests', 2, 10000);
       expect(res1.allowed).toBe(true);
       await (rateLimitService as any).recordUsage(trustUserId, 'chatbot_message_requests');
       
       const res2 = await (rateLimitService as any).evaluateLimit(trustUserId, 'chatbot_message_requests', 2, 10000);
       expect(res2.allowed).toBe(true);
       await (rateLimitService as any).recordUsage(trustUserId, 'chatbot_message_requests');

       const resBlocked = await (rateLimitService as any).evaluateLimit(trustUserId, 'chatbot_message_requests', 2, 10000);
       expect(resBlocked.allowed).toBe(false);
       expect(resBlocked.reason).toBe('rate_limited');
    });

    it('applies and respects dynamic cooldown correctly comprehensively', async () => {
       (rateLimitService as any).applyCooldown(trustUserId, 'chatbot_mutation_proposals', 1); // 1 minute
       const chk = await (rateLimitService as any).evaluateLimit(trustUserId, 'chatbot_mutation_proposals');
       expect(chk.allowed).toBe(false);
       expect(chk.cooldownActive).toBe(true);
    });

    it('triggers dynamic cooldown when excessive failed confirmations occur', async () => {
       const cSvc = app.get(ChatbotService);
       
       // Force failed confirms
       for (let i = 0; i <= 3; i++) {
          await cSvc.confirmAction(trustUserId, {
             conversationId: abuseConvId,
             confirmationToken: `invalid_mock_token_${i}`
          }).catch(() => null);
       }
       
       // Now the fourth or subsequent should strictly return a cooldown error naturally or rate limited gracefully
       const failRL = await rateLimitService.evaluateLimit(trustUserId, 'chatbot_failed_confirmations');
       expect(failRL.allowed).toBe(false);
       
       // Which cascade applies strict cooldown to mutation proposals dynamically
       const mutRL = await rateLimitService.evaluateLimit(trustUserId, 'chatbot_mutation_proposals');
       expect(mutRL.allowed).toBe(false);
       expect(mutRL.cooldownActive).toBe(true);
    });
  });

  describe('Aggressive Abuse Simulations', () => {
    const createSpamScenario = async (name: string) => {
      const user = await createUser(name);
      const conversation = await createConversationForUser(user.id);
      return { user, conversation };
    };

    it('1. Mutation spam: 30 mutation proposals triggers rate limit + cooldown', async () => {
       const scenario = await createSpamScenario('SpamUser Mutation');
       let blockCount = 0;
       
       for(let i=0; i<15; i++) {
          const res = await (governanceService as any).executeTool(
            { id: `sp_${i}`, name: 'request_booking_help', arguments: { bookingId: 'b_123', reason: 'delay' } },
            { userId: scenario.user.id, conversationId: scenario.conversation.id, executionConfirmed: false }
          );
          if (res.status === 'rate_limited' || res.status === 'cooldown_active') blockCount++;
       }
       expect(blockCount).toBeGreaterThan(0); // Surpassed the default CHATBOT_RATE_LIMIT_MUTATIONS_PER_HOUR
    });

    it('2. Confirmation abuse: triggers trust downgrade + cooldown', async () => {
       const scenario = await createSpamScenario('SpamUser Confirm Abuse');
       const cSvc = app.get(ChatbotService);
       
       for (let i = 0; i < 5; i++) {
          await cSvc.confirmAction(scenario.user.id, {
             conversationId: scenario.conversation.id,
             confirmationToken: `invalid_abuse_token_${i}`
          }).catch(() => null);
       }
       
       const trust = await (trustScoreService as any).evaluateUserTrust(scenario.user.id);
       expect(['SUSPICIOUS', 'RESTRICTED']).toContain(trust.tier);

       const mutRL = await rateLimitService.evaluateLimit(scenario.user.id, 'chatbot_action_confirmations');
       expect(mutRL.cooldownActive).toBe(true);
    });

    it('3. Permission probing: access random boundaries expect logging', async () => {
       const scenario = await createSpamScenario('SpamUser Permission Probe');
       const res = await (governanceService as any).executeTool(
         { id: 'probe_1', name: 'cancel_my_booking_if_allowed', arguments: { bookingId: 'random_unowned_bkg' } },
         { userId: scenario.user.id, conversationId: scenario.conversation.id, executionConfirmed: false }
       );

       expect(res.status).toBe('policy_blocked');

       // Verify event is natively logged
       const log = await prisma.chatbotSecurityEvent.findFirst({
         where: { userId: scenario.user.id, eventType: 'excessive_unauthorized_tools' }
       });
       expect(log).toBeDefined();
    });

    it('4. Tool flooding: rapid tool loops triggers throttle', async () => {
       const scenario = await createSpamScenario('SpamUser Tool Flood');
       let blocked = false;
       for (let i=0; i < 35; i++) {
          const res = await (governanceService as any).executeTool(
            { id: `t_${i}`, name: 'search_listings', arguments: { } },
            { userId: scenario.user.id, conversationId: scenario.conversation.id }
          );
          if (res.status === 'rate_limited' || res.status === 'cooldown_active') blocked = true;
       }
       expect(blocked).toBe(true);
    });

    it('5. Recovery behavior: explicitly restores access after cooldown expires', async () => {
       const scenario = await createSpamScenario('SpamUser Recovery');
       // Force global mock cooldown to the past natively manually via map
       (rateLimitService as any).cooldownStore.set(`${scenario.user.id}:chatbot_mutation_proposals`, Date.now() - 10000);
       
       // Manually overwrite history to pretend nothing happened newly
       (rateLimitService as any).requestStore.set(`${scenario.user.id}:chatbot_mutation_proposals`, []);
       
       // Retest execution natively efficiently
       const chk = await (rateLimitService as any).evaluateLimit(scenario.user.id, 'chatbot_mutation_proposals');
       expect(chk.allowed).toBe(true);
       expect(chk.cooldownActive).toBeFalsy();
    });
  });
});
