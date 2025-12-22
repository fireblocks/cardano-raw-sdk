import { TransactionType } from "./enums.js";
import {
  GetVaultAccountAddressOpts,
  GetVaultAccountAddressesOpts,
  SubmitTransactionOpts,
  GetTransactionsHistoryOpts,
} from "./operations.js";

/**
 * Options for executing a transaction through the API service
 */
export interface ExecuteTransactionOpts {
  /** The vault account ID to use */
  vaultAccountId: string;
  /** The type of transaction to execute */
  transactionType: TransactionType;
  /** Parameters specific to the transaction type */
  params:
    | GetVaultAccountAddressOpts
    | GetVaultAccountAddressesOpts
    | SubmitTransactionOpts
    | GetTransactionsHistoryOpts;
}
