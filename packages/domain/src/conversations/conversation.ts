import type { CompanyId, ConversationId, CustomerId, MessageId, StoreId } from "../shared/ids.ts";

export const CONVERSATION_ROLES = ["customer", "agent", "assistant", "system"] as const;

export type ConversationRole = (typeof CONVERSATION_ROLES)[number];

export const MESSAGE_ORIGINS = ["platform", "human", "ai", "system"] as const;

export type MessageOrigin = (typeof MESSAGE_ORIGINS)[number];

export type ConversationMessage = Readonly<{
  messageId: MessageId;
  conversationId: ConversationId;
  role: ConversationRole;
  origin: MessageOrigin;
  content: string;
  externalMessageId?: string;
  occurredAt: Date;
}>;

export type Conversation = Readonly<{
  companyId: CompanyId;
  storeId: StoreId;
  conversationId: ConversationId;
  customerId: CustomerId;
  messages: readonly ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}>;
