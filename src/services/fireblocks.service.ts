import {
  ConfigurationOptions as FireblocksConfig,
  Fireblocks,
  SignedMessageSignature,
  TransactionRequest,
  SignedMessageAlgorithmEnum,
  VaultWalletAddress,
} from "@fireblocks/ts-sdk";

import { getTxStatus } from "../utils/fireblocks.js";

import { Logger } from "../utils/logger.js";

/**
 * Service class for interacting with the Fireblocks SDK.
 *
 * This service provides a high-level interface for common Fireblocks operations including:
 * - Message signing for blockchain transactions
 * - Transaction broadcasting and status tracking
 * - Vault account address management
 * - Public key retrieval for cryptographic operations
 *
 * The service wraps the Fireblocks SDK with additional error handling, logging, and
 * convenience methods for common Fireblocks operations.
 *
 * @class FireblocksService
 * @example
 * ```typescript
 * const config: FireblocksConfig = {
 *   apiKey: process.env.FIREBLOCKS_API_KEY,
 *   secretKey: process.env.FIREBLOCKS_SECRET_KEY,
 *   basePath: BasePath.US
 * };
 *
 * const service = new FireblocksService(config);
 *
 * // Get vault address
 * const address = await service.getVaultAccountAddress(
 *   '123',    // vault account ID
 *   'ADA',    // asset ID
 *   0         // address index
 * );
 *
 * // Get all addresses for an asset
 * const addresses = await service.getVaultAccountAddresses(
 *   '123',
 *   'BTC'
 * );
 *
 * // Get public key
 * const publicKey = await service.getAssetPublicKey(
 *   '123',    // vault account ID
 *   'ETH',    // asset ID
 *   0,        // change index
 *   0         // address index
 * );
 * ```
 */
export class FireblocksService {
  private readonly fireblocksSDK: Fireblocks;
  private readonly logger = new Logger("services:fireblocks");

  /**
   * Creates an instance of FireblocksService.
   *
   * Initializes the Fireblocks SDK with the provided configuration, setting up
   * authentication and API endpoint configuration for all subsequent operations.
   *
   * @param config - Fireblocks SDK configuration
   * @param config.apiKey - Fireblocks API key for authentication
   * @param config.secretKey - Fireblocks secret key for signing API requests
   * @param config.basePath - Fireblocks API endpoint (US, EU, etc.)
   *
   * @example
   * ```typescript
   * // Initialize with environment variables
   * const service = new FireblocksService({
   *   apiKey: process.env.FIREBLOCKS_API_KEY!,
   *   secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
   *   basePath: BasePath.US
   * });
   *
   * // Initialize with EU endpoint
   * const euService = new FireblocksService({
   *   apiKey: apiKey,
   *   secretKey: secretKey,
   *   basePath: BasePath.EU
   * });
   * ```
   */
  constructor(config: FireblocksConfig) {
    this.fireblocksSDK = new Fireblocks({
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      basePath: config.basePath,
    });
  }

  /**
   * Retrieves a specific vault account address by derivation index.
   *
   * This method fetches all addresses for a vault account/asset combination and
   * returns the address at the specified BIP-44 derivation index. This is useful
   * for managing multiple addresses within a single vault account, where each
   * address is identified by its derivation path index.
   *
   * @param vaultAccountId - The Fireblocks vault account ID
   * @param assetId - The asset/blockchain identifier (e.g., ADA, ETH, BTC)
   * @param index - The BIP-44 address derivation index (defaults to 0 for the first address)
   *
   * @returns A Promise resolving to a VaultWalletAddress object containing:
   * - address: The blockchain address string
   * - bip44AddressIndex: The derivation index
   * - type: Address type (permanent/one-time)
   * - customerRefId: Optional customer reference ID
   * - tag: Optional address tag
   * - description: Optional address description
   *
   * @throws {Error} When no addresses exist for the vault account and asset
   * @throws {Error} When no address exists at the specified index
   * @throws {Error} When the Fireblocks API request fails
   *
   * @example
   * ```typescript
   * const service = new FireblocksService(config);
   *
   * // Get the first (default) address
   * const defaultAddress = await service.getVaultAccountAddress(
   *   '123',
   *   'ADA'
   * );
   * console.log('Address:', defaultAddress.address);
   * console.log('Index:', defaultAddress.bip44AddressIndex);
   *
   * // Get address at index 5
   * const addressAt5 = await service.getVaultAccountAddress(
   *   '123',
   *   'ADA',
   *   5
   * );
   *
   * // Get Ethereum address
   * const ethAddress = await service.getVaultAccountAddress(
   *   '456',
   *   'ETH',
   *   0
   * );
   *
   * // Handle missing address
   * try {
   *   const address = await service.getVaultAccountAddress(
   *     '789',
   *     'BTC',
   *     10
   *   );
   * } catch (error) {
   *   console.error('Address not found at index 10');
   * }
   * ```
   *
   * @remarks
   * This method internally calls getVaultAccountAddresses() to fetch all addresses
   * and then filters for the specific index. For performance, if you need multiple
   * addresses, consider calling getVaultAccountAddresses() directly to avoid
   * multiple API calls.
   *
   * The BIP-44 derivation path is: m/44'/coin_type'/account'/change/address_index
   * where address_index is the value provided in the index parameter.
   */
  public getVaultAccountAddress = async (
    vaultAccountId: string,
    assetId: string,
    index: number = 0
  ): Promise<VaultWalletAddress> => {
    try {
      const addressesResponse = await this.getVaultAccountAddresses(vaultAccountId, assetId);
      if (!addressesResponse || addressesResponse.length === 0) {
        throw new Error(`No ${assetId} addresses found for vault account ${vaultAccountId}`);
      }

      const filteredAddresses = addressesResponse.filter(
        (addr) => addr.bip44AddressIndex === index
      );
      if (filteredAddresses.length === 0) {
        throw new Error(
          `No ${assetId} address found for vault account ${vaultAccountId} and index ${index}`
        );
      }

      return filteredAddresses[0];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to get ${assetId} address for vault account ${vaultAccountId}: ${message}`
      );
    }
  };

  /**
   * Retrieves all addresses associated with a vault account for a specific asset.
   *
   * This method fetches the complete list of addresses that have been generated for
   * a vault account/asset combination. Each address includes metadata such as its
   * derivation index, type, and optional tags or descriptions.
   *
   * @param vaultAccountId - The Fireblocks vault account ID
   * @param assetId - The asset/blockchain identifier (e.g., ADA, ETH, BTC)
   *
   * @returns A Promise resolving to an array of VaultWalletAddress objects, each containing:
   * - address: The blockchain address string
   * - bip44AddressIndex: The BIP-44 derivation index
   * - type: Address type (PERMANENT or ONE_TIME)
   * - customerRefId: Optional customer reference ID
   * - tag: Optional address tag (e.g., for XRP destination tags)
   * - description: Optional human-readable description
   *
   * @throws {Error} When no addresses are found for the vault account and asset
   * @throws {Error} When the Fireblocks API request fails
   * @throws {Error} When the API response is missing the addresses field
   *
   * @example
   * ```typescript
   * const service = new FireblocksService(config);
   *
   * // Get all Cardano addresses
   * const addresses = await service.getVaultAccountAddresses(
   *   '123',
   *   'ADA'
   * );
   *
   * console.log(`Found ${addresses.length} addresses`);
   * addresses.forEach(addr => {
   *   console.log(`Index ${addr.bip44AddressIndex}: ${addr.address}`);
   * });
   *
   * // Get Ethereum addresses
   * const ethAddresses = await service.getVaultAccountAddresses(
   *   '456',
   *   'ETH'
   * );
   *
   * // Find specific address by index
   * const addressAt5 = ethAddresses.find(addr => addr.bip44AddressIndex === 5);
   *
   * // Filter permanent addresses
   * const permanentAddresses = addresses.filter(
   *   addr => addr.type === 'PERMANENT'
   * );
   *
   * // Get addresses with custom tags
   * const taggedAddresses = addresses.filter(addr => addr.tag);
   * ```
   *
   * @remarks
   * This method uses the paginated endpoint but currently doesn't implement pagination
   * logic. If you have a large number of addresses, you may need to extend this method
   * to handle pagination through multiple API calls.
   *
   * The addresses are returned in the order provided by Fireblocks, which is typically
   * sorted by creation time or derivation index.
   */
  public getVaultAccountAddresses = async (
    vaultAccountId: string,
    assetId: string
  ): Promise<VaultWalletAddress[]> => {
    try {
      const addressesResponse =
        await this.fireblocksSDK.vaults.getVaultAccountAssetAddressesPaginated({
          vaultAccountId,
          assetId,
        });

      const addresses = addressesResponse.data.addresses;
      if (!addresses) {
        throw new Error(`Failed to fetch ${assetId} addresses for vault account ${vaultAccountId}`);
      }
      return addresses;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : error &&
              typeof error === "object" &&
              "message" in error &&
              typeof error.message === "string"
            ? error.message
            : "Unknown error";

      throw new Error(
        `Failed to get ${assetId} address for vault account ${vaultAccountId}: ${message}`
      );
    }
  };

  /**
   * Broadcasts a transaction to the Fireblocks network and waits for signing completion.
   *
   * This method submits a transaction request to Fireblocks, monitors its status until
   * completion, and extracts the signed message data. It's primarily used for message
   * signing operations where the transaction is used to generate cryptographic signatures
   * rather than transferring assets.
   *
   * The method polls the transaction status until it reaches a terminal state and
   * returns the signature data from the completed transaction.
   *
   * @param transactionPayload - The transaction request to broadcast, containing:
   *   - Operation type (TYPED_MESSAGE for signing)
   *   - Source vault account
   *   - Message content to sign
   *   - Note/description for the transaction
   *
   * @returns A Promise resolving to an object containing:
   * - signature: The SignedMessageSignature with fullSig, r, s, v components
   * - content: Optional message content that was signed
   * - publicKey: Optional public key used for signing
   * - algorithm: Optional signature algorithm used (e.g., MPC_ECDSA_SECP256K1)
   * Returns null if the transaction completes but no signature is found
   *
   * @throws {Error} When transaction ID is undefined after creation
   * @throws {Error} When transaction creation or status polling fails
   * @throws {Error} When Fireblocks API returns an error response
   *
   * @example
   * ```typescript
   * const service = new FireblocksService(config);
   *
   * const payload: TransactionRequest = {
   *   operation: TransactionOperation.TYPED_MESSAGE,
   *   source: { type: 'VAULT_ACCOUNT', id: '123' },
   *   assetId: 'ADA',
   *   extraParameters: {
   *     rawMessageData: {
   *       messages: [{
   *         content: 'Message to sign',
   *         type: 'EIP191'
   *       }]
   *     }
   *   },
   *   note: 'Claim signature'
   * };
   *
   * const result = await service.broadcastTransaction(payload);
   *
   * if (result) {
   *   console.log('Signature:', result.signature.fullSig);
   *   console.log('Public key:', result.publicKey);
   *   console.log('Algorithm:', result.algorithm);
   * }
   * ```
   *
   * @remarks
   * This method is used internally by signMessage() but can also be called directly
   * for custom transaction payloads. The transaction status polling is handled by
   * the getTxStatus utility function, which waits for the transaction to complete.
   */
  public broadcastTransaction = async (
    transactionPayload: TransactionRequest
  ): Promise<{
    signature: SignedMessageSignature;
    content?: string;
    publicKey?: string;
    algorithm?: SignedMessageAlgorithmEnum;
  } | null> => {
    try {
      const transactionResponse = await this.fireblocksSDK.transactions.createTransaction({
        transactionRequest: transactionPayload,
      });

      const txId = transactionResponse.data.id;
      if (!txId) throw new Error("Transaction ID is undefined.");

      const completedTx = await getTxStatus(txId, this.fireblocksSDK);
      const signatureData = completedTx.signedMessages?.[0];
      if (signatureData?.signature) {
        return {
          signature: signatureData.signature,
          content: signatureData.content,
          publicKey: signatureData.publicKey,
          algorithm: signatureData.algorithm,
        };
      } else {
        this.logger.warn("No signed message found in response.");
        return null;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`${transactionPayload.assetId} signing error:`, message);
      throw error;
    }
  };

  /**
   * Retrieves the public key for a specific vault account asset address.
   *
   * This method fetches the public key corresponding to a specific address within
   * a vault account. The address is identified by its BIP-44 derivation path
   * components (change and addressIndex). Public keys are essential for various
   * cryptographic operations including signature verification and address generation.
   *
   * @param vaultAccountId - The Fireblocks vault account ID
   * @param assetId - The asset/blockchain identifier (e.g., ADA, ETH, BTC)
   * @param change - The BIP-44 change index (0 for external addresses, 1 for internal/change addresses)
   * @param addressIndex - The BIP-44 address index within the change path
   *
   * @returns A Promise resolving to the hex-encoded public key string
   *
   * @throws {Error} When no public key is found for the specified parameters
   * @throws {Error} When the Fireblocks API request fails
   * @throws {Error} When the vault account or asset doesn't exist
   *
   * @example
   * ```typescript
   * const service = new FireblocksService(config);
   *
   * // Get public key for the first external address (m/44'/1815'/0'/0/0 for Cardano)
   * const publicKey = await service.getAssetPublicKey(
   *   '123',
   *   'ADA',
   *   0,  // external chain
   *   0   // first address
   * );
   * console.log('Public key:', publicKey);
   *
   * // Get public key for a change address (m/44'/1815'/0'/1/5)
   * const changePublicKey = await service.getAssetPublicKey(
   *   '123',
   *   'ADA',
   *   1,  // internal/change chain
   *   5   // sixth change address
   * );
   *
   * // Get Ethereum public key
   * const ethPublicKey = await service.getAssetPublicKey(
   *   '456',
   *   'ETH',
   *   0,
   *   0
   * );
   *
   * // Use public key for signature verification
   * const signature = await service.signMessage({...});
   * const publicKey = await service.getAssetPublicKey(
   *   '123',
   *   'ADA'
   * );
   * // Verify signature with public key...
   * ```
   *
   * @remarks
   * The derivation path follows BIP-44 standard:
   * m/44'/coin_type'/account'/change/address_index
   *
   * For most use cases:
   * - change = 0: External addresses (for receiving)
   * - change = 1: Internal addresses (for change)
   * - addressIndex = 0: First address at that change level
   *
   * The returned public key is in hex format and can be used for:
   * - Signature verification
   * - Address derivation
   * - Other cryptographic operations
   */
  public getAssetPublicKey = async (
    vaultAccountId: string,
    assetId: string,
    change: number = 0,
    addressIndex: number = 0
  ): Promise<string> => {
    try {
      const response = await this.fireblocksSDK.vaults.getPublicKeyInfoForAddress({
        vaultAccountId,
        assetId,
        change,
        addressIndex,
      });

      const publicKey = response.data.publicKey;

      if (!publicKey) {
        throw new Error(
          `Error fetching public key for vault account ${vaultAccountId} on ${assetId}`
        );
      }

      return publicKey;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to get public key for vault account ${vaultAccountId} on ${assetId}: ${message}`
      );
    }
  };
}
