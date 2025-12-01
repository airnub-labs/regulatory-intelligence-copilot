import {
  ConversationEventHub,
  InMemoryConversationContextStore,
  InMemoryConversationStore,
} from '@reg-copilot/reg-intel-next-adapter';

export const conversationStore = new InMemoryConversationStore();
export const conversationContextStore = new InMemoryConversationContextStore();
export const conversationEventHub = new ConversationEventHub();
