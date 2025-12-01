import {
  ConversationEventHub,
  InMemoryConversationContextStore,
  InMemoryConversationStore,
} from '@reg-copilot/reg-intel-conversations';

export const conversationStore = new InMemoryConversationStore();
export const conversationContextStore = new InMemoryConversationContextStore();
export const conversationEventHub = new ConversationEventHub();
