import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ChatbotRequestTrace, ChatbotTraceEvent } from './chatbot-observability.types';

@Injectable()
export class ChatbotTraceService {
  private readonly logger = new Logger('ChatbotTrace');

  public startTrace(userId?: string, conversationId?: string): ChatbotRequestTrace {
    return {
      requestId: uuidv4(),
      conversationId,
      userId,
      startTime: Date.now(),
      events: [],
      llmLatencyMs: 0,
      toolCount: 0,
      toolLatenciesMs: [],
      modelsUsed: [],
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      summarizationOccurred: false,
    };
  }

  public addEvent(trace: ChatbotRequestTrace, phase: ChatbotTraceEvent['phase'], metadata?: Record<string, any>) {
    const event: ChatbotTraceEvent = {
      phase,
      timestamp: new Date().toISOString(),
      metadata,
    };
    trace.events.push(event);

    // Aggregate metrics based on event
    if (phase === 'llm_completed' && metadata) {
      if (metadata.durationMs) trace.llmLatencyMs += metadata.durationMs;
      if (metadata.modelUsed && !trace.modelsUsed.includes(metadata.modelUsed)) {
        trace.modelsUsed.push(metadata.modelUsed);
      }
      if (metadata.promptTokens) trace.totalPromptTokens += metadata.promptTokens;
      if (metadata.completionTokens) trace.totalCompletionTokens += metadata.completionTokens;
    }
    
    if (phase === 'tool_completed' && metadata) {
      trace.toolCount++;
      if (metadata.durationMs) trace.toolLatenciesMs.push(metadata.durationMs);
    }

    if (phase === 'summarization_completed') {
      trace.summarizationOccurred = true;
    }
  }

  public finalizeTrace(trace: ChatbotRequestTrace, error?: Error) {
    trace.endTime = Date.now();
    trace.totalDurationMs = trace.endTime - trace.startTime;

    if (error) {
      trace.error = error.message;
      this.addEvent(trace, 'failure', { error: error.message, stack: error.stack });
      this.logger.error(`Chatbot trace failed [${trace.requestId}]`, JSON.stringify(trace));
    } else {
      this.addEvent(trace, 'response_generated');
      // For production, we avoid dumping the whole object if it contains secrets.
      // But we built the object explicitly WITHOUT raw chat contents, so it's safe to log structurally.
      this.logger.log(`Chatbot trace completed [${trace.requestId}] -> ${JSON.stringify({
        durationMs: trace.totalDurationMs,
        userId: trace.userId,
        conversationId: trace.conversationId,
        modelsUsed: trace.modelsUsed,
        llmLatencyMs: trace.llmLatencyMs,
        tokens: trace.totalPromptTokens + trace.totalCompletionTokens,
        tools: trace.toolCount,
        summarized: trace.summarizationOccurred
      })}`);
    }
    
    return trace;
  }
}
