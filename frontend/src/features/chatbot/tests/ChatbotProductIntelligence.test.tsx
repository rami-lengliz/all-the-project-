/**
 * Product Intelligence Layer – Unit Tests
 *
 * Covers:
 * 1. getSuggestionsForContext  — context-aware entry points
 * 2. getNextStepSuggestions    — action chaining after tool results
 * 3. ChatbotSuggestions         — chip strip rendering + interaction
 */

import { getSuggestionsForContext, getNextStepSuggestions } from '../utils/chatbot-suggestions';
import { ChatbotPageContext } from '../types/chatbot-suggestions.types';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatbotSuggestions } from '../components/ChatbotSuggestions';

// ─────────────────────────────────────────────────────────────────────────────
// 1. getSuggestionsForContext
// ─────────────────────────────────────────────────────────────────────────────

describe('getSuggestionsForContext', () => {
  it('returns base suggestions when no context is provided', () => {
    const sug = getSuggestionsForContext(null);
    expect(sug.length).toBeGreaterThan(0);
    // All messages must be non-empty strings that do not expose raw IDs or tokens
    sug.forEach((s) => {
      expect(typeof s.message).toBe('string');
      expect(s.message.length).toBeGreaterThan(0);
      expect(typeof s.label).toBe('string');
    });
  });

  it('adds listing context to messages on listing pages', () => {
    const ctx: ChatbotPageContext = {
      pageType: 'listing',
      listingId: 'abc-123',
      listingTitle: 'Mountain Tent',
    };
    const sug = getSuggestionsForContext(ctx);
    const messages = sug.map((s) => s.message);
    // At least one suggestion should reference the listing ID
    expect(messages.some((m) => m.includes('abc-123'))).toBe(true);
  });

  it('includes booking ID in booking-page suggestions when provided', () => {
    const ctx: ChatbotPageContext = { pageType: 'booking', bookingId: 'bk-999' };
    const sug = getSuggestionsForContext(ctx);
    const messages = sug.map((s) => s.message);
    expect(messages.some((m) => m.includes('bk-999'))).toBe(true);
  });

  it('produces host-specific suggestions on host-dashboard pages', () => {
    const ctx: ChatbotPageContext = { pageType: 'host-dashboard', isHost: true };
    const sug = getSuggestionsForContext(ctx);
    const labels = sug.map((s) => s.label);
    expect(labels.some((l) => /pending|listing|host/i.test(l))).toBe(true);
  });

  it('every suggestion has a unique id', () => {
    const ctx: ChatbotPageContext = { pageType: 'help' };
    const sug = getSuggestionsForContext(ctx);
    const ids = sug.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('never produces suggestions with empty or whitespace-only messages', () => {
    const pageTypes: ChatbotPageContext['pageType'][] = [
      'listing', 'booking', 'host-dashboard', 'search', 'help', 'generic',
    ];
    pageTypes.forEach((pageType) => {
      const sug = getSuggestionsForContext({ pageType });
      sug.forEach((s) => {
        expect(s.message.trim().length).toBeGreaterThan(0);
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. getNextStepSuggestions
// ─────────────────────────────────────────────────────────────────────────────

describe('getNextStepSuggestions', () => {
  it('returns refine + show-more suggestions after search_listings', () => {
    const output = { data: [{ id: 'l1', title: 'Red Kayak' }] };
    const sug = getNextStepSuggestions('search_listings', output);
    expect(sug.length).toBeGreaterThan(0);
    // Should include a detail shortcut for the first result
    expect(sug.some((s) => s.message.includes('l1'))).toBe(true);
  });

  it('returns refinement suggestions when search_listings output is empty', () => {
    const sug = getNextStepSuggestions('search_listings', { data: [] });
    expect(sug.length).toBeGreaterThan(0);
    // Must not crash and must not include a listing ID reference
    sug.forEach((s) => expect(typeof s.message).toBe('string'));
  });

  it('returns follow-up actions after get_listing_details', () => {
    const output = { id: 'l2', title: 'Blue Scooter' };
    const sug = getNextStepSuggestions('get_listing_details', output);
    // Should offer contact / similar
    expect(sug.some((s) => s.message.toLowerCase().includes('similar') || s.message.includes('l2'))).toBe(true);
  });

  it('returns booking detail shortcut after get_my_bookings if items exist', () => {
    const output = [{ id: 'bk-1' }, { id: 'bk-2' }];
    const sug = getNextStepSuggestions('get_my_bookings', output);
    expect(sug.some((s) => s.message.includes('bk-1'))).toBe(true);
  });

  it('returns graceful generic fallback for unknown tool names', () => {
    const sug = getNextStepSuggestions('some_unknown_tool', {});
    expect(sug.length).toBeGreaterThan(0);
    // Must not expose undefined or internals
    sug.forEach((s) => {
      expect(s.message).not.toContain('undefined');
      expect(s.label.trim().length).toBeGreaterThan(0);
    });
  });

  it('never surfaces raw internal entity fields in messages', () => {
    const sensitiveOutput = {
      id: 'l3',
      internalScore: 99,
      adminNotes: 'flagged',
      title: 'Safe Couch',
    };
    const sug = getNextStepSuggestions('get_listing_details', sensitiveOutput);
    sug.forEach((s) => {
      expect(s.message).not.toContain('internalScore');
      expect(s.message).not.toContain('adminNotes');
      expect(s.message).not.toContain('flagged');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ChatbotSuggestions component
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatbotSuggestions component', () => {
  const mockSuggestions = [
    { id: 's1', label: 'Find listings', message: 'I want to find something to rent.', icon: 'fa-magnifying-glass', variant: 'default' as const },
    { id: 's2', label: 'My bookings', message: 'Show me my bookings.', variant: 'action' as const },
  ];

  it('renders all suggestion chips by label', () => {
    const onSelect = jest.fn();
    render(<ChatbotSuggestions suggestions={mockSuggestions} onSelect={onSelect} />);
    expect(screen.getByText('Find listings')).toBeInTheDocument();
    expect(screen.getByText('My bookings')).toBeInTheDocument();
  });

  it('calls onSelect with the correct message when a chip is clicked', () => {
    const onSelect = jest.fn();
    render(<ChatbotSuggestions suggestions={mockSuggestions} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Find listings'));
    expect(onSelect).toHaveBeenCalledWith('I want to find something to rent.');
  });

  it('does NOT call onSelect when disabled', () => {
    const onSelect = jest.fn();
    render(
      <ChatbotSuggestions suggestions={mockSuggestions} onSelect={onSelect} disabled />
    );
    fireEvent.click(screen.getByText('Find listings'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders the optional label above chips', () => {
    render(
      <ChatbotSuggestions
        suggestions={mockSuggestions}
        onSelect={jest.fn()}
        label="Try asking"
      />
    );
    expect(screen.getByText('Try asking')).toBeInTheDocument();
  });

  it('renders nothing when suggestions array is empty', () => {
    const { container } = render(
      <ChatbotSuggestions suggestions={[]} onSelect={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not pass raw message text through as visible label (avoids leaking long prompts)', () => {
    const longPromptSuggestion = [
      {
        id: 'x1',
        label: 'Short Label',
        message: 'I want to view listing abc-123 which is very long internal text nobody should see in the chip',
        variant: 'default' as const,
      },
    ];
    render(<ChatbotSuggestions suggestions={longPromptSuggestion} onSelect={jest.fn()} />);
    expect(screen.getByText('Short Label')).toBeInTheDocument();
    // The full message text should NOT be rendered directly in the DOM as visible text
    expect(screen.queryByText(/nobody should see in the chip/)).not.toBeInTheDocument();
  });
});
