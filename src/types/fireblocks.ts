import { TransactionResponse } from "@fireblocks/ts-sdk";
import { DetailedTransaction } from "./index.js";

export interface WebhookPayloadData {
  //** Event id */
  id: string;
  /** Fireblocks Transaction ID */
  resourceId: string;
  /** Fireblocks Webhook ID */
  webhookId: string;
  /** Fireblocks Workspace ID */
  workspaceId: string;
  /** Fireblocks event type */
  eventType: string;
  /** Timestamp in milliseconds */
  timestamp: number;
  data: TransactionResponse;
}

export interface EnrichedWebhookPayloadData extends Omit<WebhookPayloadData, "data"> {
  data: TransactionResponse & {
    cardanoTokensData?: DetailedTransaction;
  };
}
