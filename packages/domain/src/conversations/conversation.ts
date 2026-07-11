import type { IsoTimestamp } from "../shared/clock.ts";
import type { CompanyId, ConversationId, CustomerId, MessageId, StoreId } from "../shared/ids.ts";

export const MESSAGE_ROLES = ["customer", "agent", "assistant", "system"] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];
export type ConversationRole = MessageRole;

export const MESSAGE_ORIGINS = ["platform", "human", "ai", "system"] as const;

export type MessageOrigin = (typeof MESSAGE_ORIGINS)[number];

export type ConversationMessage = Readonly<{
  messageId: MessageId;
  conversationId: ConversationId;
  role: MessageRole;
  origin: MessageOrigin;
  content: string;
  externalMessageId?: string;
  occurredAt: IsoTimestamp;
}>;

declare const conversationBrand: unique symbol;

export type Conversation = Readonly<{
  companyId: CompanyId;
  storeId: StoreId;
  conversationId: ConversationId;
  customerId: CustomerId;
  messages: readonly ConversationMessage[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  [conversationBrand]: true;
}>;

export type ConversationInput = {
  companyId: CompanyId;
  storeId: StoreId;
  conversationId: ConversationId;
  customerId: CustomerId;
  messages: readonly ConversationMessage[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export function createConversation(input: ConversationInput): Conversation {
  const messages = Object.freeze(input.messages.map((message) => Object.freeze({ ...message })));

  return Object.freeze({
    companyId: input.companyId,
    storeId: input.storeId,
    conversationId: input.conversationId,
    customerId: input.customerId,
    messages,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }) as Conversation;
}
