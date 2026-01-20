
export interface VaultAccountOpts {
  vaultAccountId: string;
}

export interface VaultDestinationOpts extends VaultAccountOpts {
  destAddress: string;
}

export interface VaultIndexDestinationOpts extends VaultIndexOpts {
  destAddress: string;
}

export interface VaultIndexOpts extends VaultAccountOpts {
  index: number;
}

export interface TransactionStatusOpts {
  destAddress: string;
  transactionId: string;
}
