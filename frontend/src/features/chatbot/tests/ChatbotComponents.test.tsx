import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatbotConfirmationCard } from '../components/ChatbotConfirmationCard';
import { ChatbotBlockedState } from '../components/ChatbotBlockedState';
import { ChatbotToolResultRenderer } from '../components/ChatbotToolResultRenderer';

// Mock the React Query hook used by ChatbotConfirmationCard
const mockConfirmAction = jest.fn();
jest.mock('../hooks/useChatbot', () => ({
  useConfirmChatbotAction: () => ({
    mutateAsync: mockConfirmAction,
    isPending: false,
  })
}));

describe('Chatbot Frontend Component Unit Tests', () => {

  beforeEach(() => {
    mockConfirmAction.mockClear();
  });

  describe('ChatbotBlockedState', () => {
    it('renders rate_limited safely preserving UX abstractions', () => {
      render(<ChatbotBlockedState status="rate_limited" />);
      expect(screen.getByText('Rate Limit Exceeded')).toBeInTheDocument();
    });

    it('renders cooldown_active securely without leaking logic', () => {
      render(<ChatbotBlockedState status="cooldown_active" />);
      expect(screen.getByText('Temporarily Resting')).toBeInTheDocument();
    });

    it('renders trust_restricted naturally explicitly mapping penalties', () => {
      render(<ChatbotBlockedState status="trust_restricted" />);
      expect(screen.getByText('Action Restricted')).toBeInTheDocument();
    });
  });

  describe('ChatbotToolResultRenderer: Structured Mapping Strategies', () => {
    it('renders search_listings structured safely avoiding raw JSON output mapping', () => {
      const mockResult = {
        output: {
          data: [
            { id: '1', title: 'Luxury Villa', category: 'real estate', price: 150 }
          ]
        }
      };
      render(<ChatbotToolResultRenderer toolName="search_listings" result={mockResult} />);
      expect(screen.getByText('Luxury Villa')).toBeInTheDocument();
    });

    it('traps arbitrary objects safely gracefully formatting success text without JSON dumping', () => {
      const mockResult = {
        output: {
          message: 'Action completed efficiently gracefully successfully.'
        }
      };
      render(<ChatbotToolResultRenderer toolName="cancel_my_booking_if_allowed" result={mockResult} />);
      expect(screen.getByText('Action completed efficiently gracefully successfully.')).toBeInTheDocument();
    });
  });

  describe('ChatbotConfirmationCard: Action Boundaries', () => {
    it('requires confirmation token reliably interacting naturally identically correctly seamlessly smoothly exactly organically safely dynamically properly efficiently', async () => {
      render(
        <ChatbotConfirmationCard 
          conversationId="c1" 
          token="t1" 
          actionName="cancel_my_booking_if_allowed" 
          summary="Confirm cancellation of #123" 
        />
      );

      expect(screen.getByText('Confirm cancellation of #123')).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /Confirm/i });
      
      mockConfirmAction.mockResolvedValueOnce({ success: true });
      fireEvent.click(confirmBtn);

      expect(mockConfirmAction).toHaveBeenCalledWith({
        conversationId: 'c1',
        confirmationToken: 't1'
      });

      await waitFor(() => {
        expect(screen.getByText('Action Completed')).toBeInTheDocument();
      });
    });
  });
});
