# Cardano Raw SDK

A TypeScript SDK for managing Cardano token transfers through Fireblocks, with integrated Iagon API services for balance queries, transaction history, and token operations.

## Features

- 🔐 **Fireblocks Integration**: Secure vault account management and transaction signing
- 🏦 **Balance Queries**: Check balances by address, credential, or stake key
- 💸 **Token Transfers**: Execute Cardano token transfers with automatic UTXO selection
  - Native ADA transfers
  - Single token (CNT) transfers
  - Multi-token transfers (multiple tokens in one transaction)
  - Address-to-address transfers
  - Vault-to-vault transfers for seamless internal operations
- 💰 **Fee Estimation**: Accurate fee calculation for ADA, single-token, and multi-token transfers
- 🔧 **UTxO Management**: Consolidate fragmented UTxOs to optimize wallet efficiency
- 🗳️ **Governance Operations**: Full Conway-era governance support
  - Register as a DRep (Delegated Representative)
  - Cast votes on governance actions
  - Delegate voting power to DReps
- 🏊 **Staking Operations**: Complete staking lifecycle management
  - Register/deregister stake keys
  - Delegate to stake pools
  - Withdraw rewards
- 📊 **Transaction History**: Retrieve basic and detailed transaction history with pagination
- 🏊 **Pool Information**: Query stake pool metadata, delegators, and blocks
- 🔄 **Connection Pooling**: Efficient SDK instance management with automatic cleanup
- 🌐 **Multi-Network Support**: Works with Cardano mainnet, preprod, and preview networks
- 🚀 **REST API Server**: Optional Express server for HTTP-based operations
- 🐳 **Docker Support**: Easy deployment with Docker

## Table of Contents

- [Installation](#installation)
- [Usage Methods](#usage-methods)
  - [Method 1: TypeScript SDK](#method-1-typescript-sdk)
  - [Method 2: REST API Service](#method-2-rest-api-service)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Examples](#examples)
- [Development](#development)

## Installation

### Prerequisites

- Node.js 18+ (for SDK usage)
- Docker (for API service deployment)
- Fireblocks API credentials
- Iagon API key (required for balance queries, transaction history, and transfers)

### Install as a TypeScript Package

**Install from GitHub** (for use as a dependency in your project):

```bash
# Install directly from GitHub
npm install github:fireblocks/cardano-raw-sdk

# Or install a specific branch/tag
npm install github:fireblocks/cardano-raw-sdk#main
npm install github:fireblocks/cardano-raw-sdk#v1.0.0
```

**Or clone for development**:

```bash
git clone https://github.com/fireblocks/cardano-raw-sdk.git
cd cardano-raw-sdk
npm install
npm run build
```

## Usage Methods

### Method 1: TypeScript SDK

Use the SDK directly in your TypeScript/JavaScript application.

#### Basic Setup

```typescript
import { FireblocksCardanoRawSDK } from "cardano-raw-sdk";
import { Networks, SupportedAssets } from "cardano-raw-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

// Initialize the SDK
const sdk = await FireblocksCardanoRawSDK.createInstance({
  fireblocksConfig: {
    apiKey: "your-fireblocks-api-key",
    secretKey: "your-fireblocks-secret-key",
    basePath: BasePath.US,
  },
  vaultAccountId: "your-vault-account-id",
  network: Networks.MAINNET,
  iagonApiKey: "your-iagon-api-key",
});
```

#### Get Balance

```typescript
// Get balance by address
const balance = await sdk.getBalanceByAddress({
  index: 0,
  groupByPolicy: false,
});

console.log("Balance:", balance);

// Get balance by stake key
const stakeBalance = await sdk.getBalanceByStakeKey({
  stakeKey: "stake1u8a9qstrmj...",
  groupByPolicy: true,
});
```

#### Transfer Native ADA

Transfer ADA without any tokens:

```typescript
const result = await sdk.transferAda({
  index: 0, // Source address index
  recipientAddress: "addr1qxy...",
  adaAmount: 5000000, // 5 ADA in lovelace
});

console.log("Transaction Hash:", result.txHash);
console.log("Sender Address:", result.senderAddress);
console.log("Fee:", result.fee.ada, "ADA");
```

#### Transfer Single Token (CNT)

The SDK supports two transfer modes:

**1. Transfer to a Cardano Address**

```typescript
const transferResult = await sdk.transfer({
  index: 0,
  recipientAddress: "addr1qxy...",
  tokenPolicyId: "f0ff48bbb7bbe9d5...",
  tokenName: "4e49...",
  requiredTokenAmount: 1000000,
});

console.log("Transaction Hash:", transferResult.txHash);
console.log("Sender Address:", transferResult.senderAddress);
console.log("Fee:", transferResult.fee.ada, "ADA"); // e.g., "0.170000 ADA"
console.log("Fee (lovelace):", transferResult.fee.lovelace); // e.g., "170000"
```

**2. Vault-to-Vault Transfer**

```typescript
const transferResult = await sdk.transfer({
  index: 0, // Source address index
  recipientVaultAccountId: "1", // Destination vault account
  recipientIndex: 0, // Destination address index (optional, defaults to 0)
  tokenPolicyId: "f0ff48bbb7bbe9d5...",
  tokenName: "4e49...",
  requiredTokenAmount: 1000000,
});

console.log("Transaction Hash:", transferResult.txHash);
console.log("Sender Address:", transferResult.senderAddress);
console.log("Fee:", transferResult.fee.ada, "ADA"); // e.g., "0.170000 ADA"
```

**Note**: You must provide exactly one of `recipientAddress` or `recipientVaultAccountId`, not both.

#### Transfer Multiple Tokens

Transfer multiple different tokens in a single transaction:

```typescript
const result = await sdk.transferMultipleTokens({
  index: 0,
  recipientAddress: "addr1qxy...",
  tokens: [
    {
      policyId: "f0ff48bbb7bbe9d5...",
      assetName: "4e4654",
      amount: 1000000,
    },
    {
      policyId: "a1b2c3d4e5f6...",
      assetName: "544f4b454e",
      amount: 500000,
    },
  ],
  includeAda: true, // Optional: include extra ADA in the transfer
  adaAmount: 2000000, // 2 ADA in lovelace (required if includeAda is true)
});

console.log("Transaction Hash:", result.txHash);
console.log("Fee:", result.fee.ada, "ADA");
```

**Estimate multi-token transfer fee:**

```typescript
const feeEstimate = await sdk.estimateMultiTokenTransactionFee({
  index: 0,
  recipientAddress: "addr1qxy...",
  tokens: [
    { policyId: "f0ff48bbb...", assetName: "4e4654", amount: 1000000 },
    { policyId: "a1b2c3d4e5f6...", assetName: "544f4b454e", amount: 500000 },
  ],
});

console.log("Estimated Fee:", feeEstimate.fee.ada, "ADA");
```

#### Consolidate UTxOs

Consolidate fragmented UTxOs to optimize your wallet:

```typescript
const result = await sdk.consolidateUtxos({
  index: 0,
  targetAddress: "addr1qxy...", // Optional: defaults to source address
});

console.log("Transaction Hash:", result.txHash);
console.log("Consolidated", result.inputCount, "UTxOs");
console.log("Fee:", result.fee.ada, "ADA");
```

#### Transaction History

```typescript
// Get basic transaction history
const history = await sdk.getTransactionHistory({
  index: 0,
  limit: 10,
  offset: 0,
  fromSlot: 100000,
});

// Get detailed transaction history with inputs/outputs
const detailedHistory = await sdk.getDetailedTxHistory({
  index: 0,
  limit: 10,
  offset: 0,
});

// Get transaction details by hash
const txDetails = await sdk.getTransactionDetails("6c9e6d70a0ce7ca5d...");
```

#### Asset Information

```typescript
// Get detailed asset information including metadata and decimals
const assetInfo = await sdk.getAssetInfo(
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a", // Policy ID
  "4e4654" // Asset name (hex)
);

console.log("Token Name:", assetInfo.data.metadata?.name);
console.log("Ticker:", assetInfo.data.metadata?.ticker);
console.log("Decimals:", assetInfo.data.metadata?.decimals);
console.log("Total Supply:", assetInfo.data.total_supply);
console.log("Logo:", assetInfo.data.metadata?.logo);

// Use decimals to format token amounts correctly
const rawAmount = 1000000;
const decimals = assetInfo.data.metadata?.decimals || 0;
const formattedAmount = rawAmount / Math.pow(10, decimals);
console.log(`Amount: ${formattedAmount} ${assetInfo.data.metadata?.ticker}`);
```

#### Governance Operations

**Register as a DRep (Delegated Representative)**

```typescript
const result = await sdk.registerAsDRep({
  vaultAccountId: "your-vault-id",
  index: 0,
  anchor: {
    url: "https://example.com/drep-metadata.json",
    dataHash: "abc123...", // Blake2b-256 hash of the metadata
  },
});

console.log("Transaction Hash:", result.txHash);
console.log("DRep ID:", result.drepId);
// Note: Requires 500 ADA deposit
```

**Cast a Governance Vote (as a DRep)**

```typescript
const result = await sdk.castGovernanceVote({
  vaultAccountId: "your-vault-id",
  index: 0,
  governanceActionTxHash: "abc123...",
  governanceActionIndex: 0,
  vote: "yes", // "yes", "no", or "abstain"
});

console.log("Transaction Hash:", result.txHash);
```

**Delegate Voting Power to a DRep**

```typescript
const result = await sdk.delegateToDRep({
  vaultAccountId: "your-vault-id",
  index: 0,
  drepId: "drep1...", // DRep credential or key hash
});

console.log("Transaction Hash:", result.txHash);
```

#### Pool Information

```typescript
// Get pool metadata (name, ticker, description)
const metadata = await sdk.getPoolMetadata("pool1...");
console.log("Pool Name:", metadata.data.name);
console.log("Ticker:", metadata.data.ticker);

// Get pool delegators summary
const delegators = await sdk.getPoolDelegators("pool1...");
console.log("Total Delegators:", delegators.data.total_count);
console.log("Active Stake:", delegators.data.active_stake);

// Get detailed delegator list with pagination
const delegatorList = await sdk.getPoolDelegatorsList("pool1...", 10, 0);

// Get blocks produced by pool
const blocks = await sdk.getPoolBlocks("pool1...");
console.log("Total Blocks:", blocks.data.length);
```

#### Vault Account Operations

```typescript
// Get vault account addresses
const addresses = await sdk.getVaultAccountAddresses();

// Get public key (change index, address index)
const publicKey = await sdk.getPublicKey(0, 0);
```

#### Graceful Shutdown

```typescript
// Clean up resources when done
await sdk.shutdown();
```

### Method 2: REST API Service

Run the SDK as a REST API service using Docker or Node.js directly.

#### Quick Start with Docker

1. **Clone the repository**:

   ```bash
   git clone https://github.com/fireblocks/cardano-raw-sdk.git
   cd cardano-raw-sdk
   ```

2. **Configure environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start the service**:

   ```bash
   # Build the image
   docker build -t cardano-raw-sdk .

   # Run the container (mounts the local .env and Fireblocks secret key)
   docker run -d --name cardano-raw-sdk \
     --env-file .env \
     -p 8000:8000 \
     -v "$PWD/secrets:/app/secrets:ro" \
     cardano-raw-sdk
   ```

4. **Access the API**:
   - API Base URL: `http://localhost:8000/api`
   - Swagger Documentation: `http://localhost:8000/api-docs`
   - Health Check: `http://localhost:8000/health`

#### API Endpoints

##### Balance Operations

```bash
# Get balance by address
GET /api/balance/address/:vaultAccountId?assetId=ADA&index=0&groupByPolicy=false

# Get balance by credential
GET /api/balance/credential/:vaultAccountId/:credential?groupByPolicy=false

# Get balance by stake key
GET /api/balance/stake-key/:vaultAccountId/:stakeKey?groupByPolicy=false
```

##### Webhook Operations

**Setup in Fireblocks Console:**

1. Go to **Fireblocks Console → Settings → Webhooks**
2. Add webhook URL: `https://your-domain.com/api/webhook`
3. Select events: `TRANSACTION_CREATED`, `TRANSACTION_STATUS_UPDATED`, etc.
4. Fireblocks will automatically sign webhooks with both JWKS and legacy signatures

**Important:** Ensure your server's `FIREBLOCKS_BASE_PATH` environment variable matches your Fireblocks workspace:

- US workspace: `https://api.fireblocks.io` (default)
- EU workspace: `https://api.eu1.fireblocks.io`
- EU2 workspace: `https://api.eu2.fireblocks.io`
- Sandbox: `https://sandbox-api.fireblocks.io`

**Endpoint:**

```bash
# Enrich Fireblocks webhook with automatic signature verification
POST /api/webhook
Content-Type: application/json
Headers:
  - fireblocks-webhook-signature: <JWT signature> (added by Fireblocks)
  - fireblocks-signature: <Legacy signature> (added by Fireblocks)

Body:
{
  "eventType": "transaction.created",
  "data": { ... }
}

# Response (enriched with CNT data):
{
  "eventType": "transaction.created",
  "data": {
    ...
    "cardanoTokensData": {
      "tx_hash": "...",
      "inputs": [...],
      "outputs": [...]
    }
  }
}
```

**Security:** The endpoint automatically verifies webhook signatures using:

- **JWKS** (modern, automatic key rotation) - tries first
- **Legacy RSA-SHA512** (static keys) - fallback
- Verification environment is automatically determined from `FIREBLOCKS_BASE_PATH` config

Invalid signatures are rejected with 401 error.

##### Transaction Operations

```bash
# Get transaction details by hash
GET /api/tx/hash/:hash

# Get asset information (metadata, decimals, supply)
GET /api/assets/:policyId/:assetName

# Get transaction history
GET /api/tx/history/:vaultAccountId?index=0&limit=10&offset=0&fromSlot=100000

# Get detailed transaction history
GET /api/tx/address/:vaultAccountId?index=0&limit=10&offset=0
```

##### Transfer Operations

**ADA Transfers**

```bash
# Transfer native ADA
POST /api/transfers/ada
Content-Type: application/json

{
  "vaultAccountId": "your-vault-id",
  "recipientAddress": "addr1qxy...",
  "adaAmount": 5000000,
  "index": 0
}

# Estimate ADA transfer fee
POST /api/fee-estimate/ada
Content-Type: application/json

{
  "vaultAccountId": "your-vault-id",
  "recipientAddress": "addr1qxy...",
  "adaAmount": 5000000,
  "index": 0
}
```

**Single Token (CNT) Transfers**

```bash
# Execute transfer (to address)
POST /api/transfers
Content-Type: application/json

{
  "vaultAccountId": "your-vault-id",
  "recipientAddress": "addr1qxy...",
  "tokenPolicyId": "f0ff48bbb7bbe9d5...",
  "tokenName": "4e49...",
  "requiredTokenAmount": 1000000,
  "index": 0
}

# Response:
{
  "txHash": "a1b2c3d4e5f6...",
  "senderAddress": "addr1qxy...",
  "tokenName": "4e49...",
  "fee": {
    "lovelace": "170000",
    "ada": "0.170000"
  }
}

# Execute transfer (vault-to-vault)
POST /api/transfers
Content-Type: application/json

{
  "vaultAccountId": "0",
  "recipientVaultAccountId": "1",
  "recipientIndex": 0,
  "tokenPolicyId": "f0ff48bbb7bbe9d5...",
  "tokenName": "4e49...",
  "requiredTokenAmount": 1000000,
  "index": 0
}
```

**Multi-Token Transfers**

```bash
# Transfer multiple tokens in one transaction
POST /api/transfers/tokens
Content-Type: application/json

{
  "vaultAccountId": "your-vault-id",
  "recipientAddress": "addr1qxy...",
  "tokens": [
    {
      "policyId": "f0ff48bbb7bbe9d5...",
      "assetName": "4e4654",
      "amount": 1000000
    },
    {
      "policyId": "a1b2c3d4e5f6...",
      "assetName": "544f4b454e",
      "amount": 500000
    }
  ],
  "includeAda": true,
  "adaAmount": 2000000,
  "index": 0
}

# Estimate multi-token transfer fee
POST /api/fee-estimate/tokens
Content-Type: application/json

{
  "vaultAccountId": "your-vault-id",
  "recipientAddress": "addr1qxy...",
  "tokens": [
    { "policyId": "f0ff48bbb...", "assetName": "4e4654", "amount": 1000000 }
  ],
  "index": 0
}
```

**UTxO Consolidation**

```bash
# Consolidate fragmented UTxOs
POST /api/utxos/consolidate
Content-Type: application/json

{
  "vaultAccountId": "your-vault-id",
  "index": 0,
  "targetAddress": "addr1qxy..." // Optional
}

# Response:
{
  "txHash": "a1b2c3d4e5f6...",
  "inputCount": 15,
  "fee": {
    "lovelace": "200000",
    "ada": "0.200000"
  }
}
```

##### Governance Operations

```bash
# Register as a DRep (requires 500 ADA deposit)
POST /api/governance/register-drep
Content-Type: application/json

{
  "vaultAccountId": "your-vault-id",
  "index": 0,
  "anchor": {
    "url": "https://example.com/drep-metadata.json",
    "dataHash": "abc123..."
  }
}

# Cast a governance vote (as a DRep)
POST /api/governance/vote
Content-Type: application/json

{
  "vaultAccountId": "your-vault-id",
  "index": 0,
  "governanceActionTxHash": "abc123...",
  "governanceActionIndex": 0,
  "vote": "yes"
}

# Delegate voting power to a DRep
POST /api/governance/delegate-drep
Content-Type: application/json

{
  "vaultAccountId": "your-vault-id",
  "index": 0,
  "drepId": "drep1..."
}
```

##### Pool Information

```bash
# Get pool metadata (name, ticker, description)
GET /api/pools/:poolId/metadata

# Get pool delegators summary
GET /api/pools/:poolId/delegators?limit=10&offset=0

# Get detailed delegator list
GET /api/pools/:poolId/delegators/list?limit=10&offset=0

# Get blocks produced by pool
GET /api/pools/:poolId/blocks
```

##### Example cURL Commands

```bash
# Get balance
curl http://localhost:8000/api/balance/address/vault-123?assetId=ADA&index=0

# Get transaction history
curl http://localhost:8000/api/tx/history/vault-123?limit=5

# Get asset information
curl http://localhost:8000/api/assets/f0ff48bbb7bbe9d5.../4e4654

# Transfer native ADA
curl -X POST http://localhost:8000/api/transfers/ada \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "vault-123",
    "recipientAddress": "addr1qxy...",
    "adaAmount": 5000000,
    "index": 0
  }'

# Estimate ADA transfer fee
curl -X POST http://localhost:8000/api/fee-estimate/ada \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "vault-123",
    "recipientAddress": "addr1qxy...",
    "adaAmount": 5000000,
    "index": 0
  }'

# Execute CNT transfer (to address)
curl -X POST http://localhost:8000/api/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "vault-123",
    "recipientAddress": "addr1qxy...",
    "tokenPolicyId": "f0ff48bbb...",
    "tokenName": "4e49...",
    "requiredTokenAmount": 1000000
  }'
# Response: {"txHash":"a1b2c3d4...","senderAddress":"addr1qxy...","tokenName":"4e49...","fee":{"lovelace":"170000","ada":"0.170000"}}

# Execute CNT transfer (vault-to-vault)
curl -X POST http://localhost:8000/api/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "0",
    "recipientVaultAccountId": "1",
    "tokenPolicyId": "f0ff48bbb...",
    "tokenName": "4e49...",
    "requiredTokenAmount": 1000000
  }'

# Transfer multiple tokens
curl -X POST http://localhost:8000/api/transfers/tokens \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "vault-123",
    "recipientAddress": "addr1qxy...",
    "tokens": [
      {"policyId": "f0ff48bbb...", "assetName": "4e4654", "amount": 1000000},
      {"policyId": "a1b2c3d4e5f6...", "assetName": "544f4b454e", "amount": 500000}
    ],
    "includeAda": true,
    "adaAmount": 2000000
  }'

# Consolidate UTxOs
curl -X POST http://localhost:8000/api/utxos/consolidate \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "vault-123",
    "index": 0
  }'

# Register as DRep
curl -X POST http://localhost:8000/api/governance/register-drep \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "vault-123",
    "index": 0,
    "anchor": {
      "url": "https://example.com/drep-metadata.json",
      "dataHash": "abc123..."
    }
  }'

# Cast governance vote
curl -X POST http://localhost:8000/api/governance/vote \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "vault-123",
    "index": 0,
    "governanceActionTxHash": "abc123...",
    "governanceActionIndex": 0,
    "vote": "yes"
  }'

# Delegate to DRep
curl -X POST http://localhost:8000/api/governance/delegate-drep \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "vault-123",
    "index": 0,
    "drepId": "drep1..."
  }'

# Get pool metadata
curl http://localhost:8000/api/pools/pool1.../metadata

# Get pool delegators
curl http://localhost:8000/api/pools/pool1.../delegators?limit=10

# Get pool blocks
curl http://localhost:8000/api/pools/pool1.../blocks
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable                              | Required | Default                                     | Description                                                     |
| ------------------------------------- | -------- | ------------------------------------------- | --------------------------------------------------------------- |
| `PORT`                                | No       | `8000`                                      | HTTP server port                                                |
| `NODE_ENV`                            | No       | `production`                                | Set to `development` only when using self-signed certs locally  |
| `FIREBLOCKS_API_USER_KEY`             | Yes      | -                                           | Fireblocks API key UUID                                         |
| `FIREBLOCKS_API_USER_SECRET_KEY_PATH` | Yes      | -                                           | Absolute path to the Fireblocks RSA secret key file             |
| `FIREBLOCKS_BASE_PATH`                | No       | `https://api.fireblocks.io`                 | Fireblocks workspace URL - also controls webhook JWKS region    |
| `IAGON_API_KEY`                       | Yes      | -                                           | Iagon API key for blockchain data queries                       |
| `IAGON_BASE_URL`                      | No       | `https://api.fireblocks.partners.iagon.com` | Override the Iagon API base URL (staging / private deployments) |
| `CARDANO_NETWORK`                     | No       | `mainnet`                                   | `mainnet` or `preprod`                                          |
| `MAX_BODY_SIZE`                       | No       | `1mb`                                       | Maximum request body size                                       |
| `RATE_LIMIT_WINDOW_MS`                | No       | `900000`                                    | Rate limit time window (ms)                                     |
| `RATE_LIMIT_MAX_REQUESTS`             | No       | `100`                                       | Max requests per rate limit window                              |
| `TRUST_PROXY`                         | No       | `false`                                     | Express `trust proxy` setting (hop count, preset, or boolean)   |
| `CORS_ORIGINS`                        | No       | unset (CORS disabled)                       | Allowed CORS origins (comma-separated, or `*`)                  |
| `API_KEY_ENABLED`                     | No       | `false`                                     | Enable API key authentication                                   |
| `API_KEY`                             | No       | -                                           | API key value (required if `API_KEY_ENABLED=true`)              |

**Fireblocks base path options:**

- US (default): `https://api.fireblocks.io`

### Fireblocks Secret Key

The SDK supports three ways to provide your Fireblocks RSA private key:

#### Option 1: File Path (Recommended for local development)

```bash
# Create a secure directory
mkdir -p ~/.fireblocks

# Save your secret key
cat > ~/.fireblocks/secret.key << 'EOF'
-----BEGIN PRIVATE KEY-----
MIIJQgIBADANBgkqhki...
-----END PRIVATE KEY-----
EOF

# Set proper permissions
chmod 600 ~/.fireblocks/secret.key

# Set environment variable
export FIREBLOCKS_API_USER_SECRET_KEY_PATH=/home/user/.fireblocks/secret.key
```

#### Option 2: Direct PEM Content (CI/CD environments)

```bash
# Set the key content directly (with newlines)
export FIREBLOCKS_API_USER_SECRET_KEY="-----BEGIN PRIVATE KEY-----
MIIJQgIBADANBgkqhki...
-----END PRIVATE KEY-----"
```

#### Option 3: Base64 Encoded (Recommended for CI/CD secrets)

```bash
# Encode your key file to base64 (single line, easy to store as secret)
cat ~/.fireblocks/secret.key | base64 -w 0 > key.b64

# Set the base64-encoded content
export FIREBLOCKS_API_USER_SECRET_KEY=$(cat key.b64)
```

**Priority:** If both `FIREBLOCKS_API_USER_SECRET_KEY` and `FIREBLOCKS_API_USER_SECRET_KEY_PATH` are set, the direct key content takes precedence.

### Security Configuration

The API server includes configurable security middleware for CORS, rate limiting, and optional API key authentication. All settings are configured via environment variables.

| Variable                  | Default  | Description                                                                                                                    |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `MAX_BODY_SIZE`           | `1mb`    | Maximum request body size (e.g., `1mb`, `500kb`)                                                                               |
| `RATE_LIMIT_WINDOW_MS`    | `900000` | Rate limiting time window in milliseconds (default: 15 minutes)                                                                |
| `RATE_LIMIT_MAX_REQUESTS` | `100`    | Maximum requests allowed per window                                                                                            |
| `TRUST_PROXY`             | `false`  | Express `trust proxy` setting: number of reverse-proxy hops (e.g., `1`), a preset/subnet (`loopback`, `10.0.0.0/8`), or `true` |
| `CORS_ORIGINS`            | unset    | Allowed CORS origins: comma-separated list, or `*` for all. Unset: no CORS headers are sent (browsers enforce same-origin)     |
| `API_KEY_ENABLED`         | `false`  | Enable API key authentication                                                                                                  |
| `API_KEY`                 | -        | Required API key value when `API_KEY_ENABLED=true`                                                                             |

#### CORS Configuration

CORS is disabled by default: no CORS headers are sent, so browsers block cross-origin calls. Enable it only if browser clients call this API directly. A wildcard origin is served without credentials (as the CORS specification requires) and logs a startup warning.

```bash
# Allow specific origins (production)
CORS_ORIGINS=https://myapp.com,https://admin.myapp.com

# Allow all origins (development only)
CORS_ORIGINS=*
```

#### Rate Limiting

Rate limiting protects against abuse. The `/health` endpoint is exempt to support load balancer health checks.

```bash
# 100 requests per 15 minutes (default)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Stricter: 50 requests per 5 minutes
RATE_LIMIT_WINDOW_MS=300000
RATE_LIMIT_MAX_REQUESTS=50
```

#### Running Behind a Reverse Proxy

When the server runs behind a reverse proxy (nginx, AWS ALB, Docker ingress), set `TRUST_PROXY` to the number of proxy hops so rate limiting keys on the client IP rather than the proxy's:

```bash
# One proxy hop (single nginx or load balancer)
TRUST_PROXY=1

# Two hops (e.g., CDN in front of nginx)
TRUST_PROXY=2

# Only trust proxies on the local machine
TRUST_PROXY=loopback
```

The proxy must forward the client address via the `X-Forwarded-For` header (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`; managed load balancers do this automatically). With the default `TRUST_PROXY=false`, requests arriving through a proxy are rate-limited by the proxy's address, so all clients share one limit bucket.

#### API Key Authentication

When enabled, all requests require the `X-API-Key` header, except `/health`, `/api-docs`, `/docs`, and `/api/webhook` (authenticated by Fireblocks signature verification instead).

```bash
# Enable API key authentication
API_KEY_ENABLED=true
API_KEY=your-secret-api-key-here
```

Client requests must include the header:

```bash
curl -H "X-API-Key: your-secret-api-key-here" http://localhost:8000/api/balance/123
```

### Protocol Parameters Configuration

Cardano protocol parameter overrides can be supplied at SDK initialization.

**Current scope of effect:** the overrides are consumed only by the API layer's fee validation floor (`minFeeB`). Transaction building, minimum-UTxO calculation, and staking/governance deposits use compiled-in constants; wiring them to runtime parameters is tracked as audit finding H-04, pending the Iagon protocol-parameters endpoint. The store is also process-global: the last override wins across all SDK instances in the process, and conflicting overrides log a warning.

| Parameter          | Default     | Description                                     | Consumed today       |
| ------------------ | ----------- | ----------------------------------------------- | -------------------- |
| `minFeeA`          | `44`        | Fee coefficient: lovelace per transaction byte  | No (constants)       |
| `minFeeB`          | `155381`    | Fee constant: base lovelace fee                 | API validation floor |
| `coinsPerUtxoByte` | `4310`      | Lovelace per UTxO byte for min-ADA calculations | No (constants)       |
| `stakeKeyDeposit`  | `2000000`   | Stake key registration deposit (2 ADA)          | No (constants)       |
| `drepDeposit`      | `500000000` | DRep registration deposit (500 ADA)             | No (constants)       |

#### SDK Usage

```typescript
const sdk = await FireblocksCardanoRawSDK.createInstance({
  fireblocksConfig: { apiKey, secretKey, basePath },
  vaultAccountId: "123",
  network: Networks.MAINNET,
  iagonApiKey: "...",
  // Override the Iagon API base URL (optional - falls back to IAGON_BASE_URL env, then default)
  iagonBaseUrl: "https://staging.iagon.example.com",
  // Override protocol parameters (optional; see scope of effect above)
  protocolParams: {
    minFeeB: 155381,
  },
});
```

You only need to specify parameters that have changed - unspecified parameters keep their defaults.

## API Documentation

### Swagger UI

When running the API service, interactive API documentation is available at:

```
http://localhost:8000/api-docs
```

### TypeDoc Documentation

Generate TypeScript documentation:

```bash
npm run docs
```

View the generated documentation by opening `docs/index.html` in your browser.

## Examples

### Example 1: Transfer Tokens with SDK

```typescript
import { FireblocksCardanoRawSDK } from "cardano-raw-sdk";
import { Networks, SupportedAssets } from "cardano-raw-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

async function transferTokens() {
  const sdk = await FireblocksCardanoRawSDK.createInstance({
    fireblocksConfig: {
      apiKey: process.env.FIREBLOCKS_API_KEY!,
      secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
      basePath: BasePath.US,
    },
    vaultAccountId: "vault-123",
    network: Networks.MAINNET,
    iagonApiKey: process.env.IAGON_API_KEY!,
  });

  try {
    const result = await sdk.transfer({
      recipientAddress: "addr1qxy...",
      tokenPolicyId: "f0ff48bbb7bbe9d5...",
      tokenName: "4e49...",
      requiredTokenAmount: 1000000,
    });

    console.log("Transfer successful!");
    console.log("Transaction Hash:", result.txHash);
    console.log("Sender Address:", result.senderAddress);
    console.log("Transaction Fee:", result.fee.ada, "ADA");
    console.log("View on Cardanoscan:", `https://cardanoscan.io/transaction/${result.txHash}`);
  } catch (error) {
    console.error("Transfer failed:", error);
  } finally {
    await sdk.shutdown();
  }
}

transferTokens();
```

### Example 2: SDK Manager with Connection Pooling

```typescript
import { SdkManager } from "cardano-raw-sdk/pool";
import { FireblocksCardanoRawSDK } from "cardano-raw-sdk";
import { Networks } from "cardano-raw-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

const manager = new SdkManager(
  {
    apiKey: process.env.FIREBLOCKS_API_KEY!,
    secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
    basePath: BasePath.US,
  },
  Networks.MAINNET,
  {
    maxPoolSize: 50,
    idleTimeoutMs: 20 * 60 * 1000,
  },
  async (vaultAccountId, fireblocksConfig, network) =>
    FireblocksCardanoRawSDK.createInstance({
      fireblocksConfig,
      vaultAccountId,
      network,
    })
);

// Get SDK for a vault account (automatically pooled)
const sdk1 = await manager.getSdk("vault-123");
const balance1 = await sdk1.getBalanceByAddress({ index: 0 });

// Reuses the same SDK instance
const sdk2 = await manager.getSdk("vault-123");
const balance2 = await sdk2.getBalanceByAddress({ index: 0 });

// Release SDK back to pool when done
manager.releaseSdk("vault-123");

// Get pool metrics
const metrics = manager.getMetrics();
console.log("Pool Metrics:", metrics);

// Shutdown when done
await manager.shutdown();
```

### Example 3: API Client in JavaScript

```javascript
const axios = require("axios");

const API_BASE_URL = "http://localhost:8000/api";

async function getBalanceAndTransfer() {
  try {
    // Get balance
    const balanceResponse = await axios.get(`${API_BASE_URL}/balance/address/vault-123`, {
      params: {
        assetId: "ADA",
        index: 0,
        groupByPolicy: true,
      },
    });
    console.log("Balance:", balanceResponse.data);

    // Execute transfer
    const transferResponse = await axios.post(`${API_BASE_URL}/transfers`, {
      vaultAccountId: "vault-123",
      recipientAddress: "addr1qxy...",
      tokenPolicyId: "f0ff48bbb7bbe9d5...",
      tokenName: "4e49...",
      requiredTokenAmount: 1000000,
    });
    console.log("Transfer Result:", transferResponse.data);
    console.log("Transaction Hash:", transferResponse.data.txHash);
    console.log("Fee:", transferResponse.data.fee.ada, "ADA");
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

getBalanceAndTransfer();
```

### Example 4: Using Cache for Performance

```typescript
import { FireblocksCardanoRawSDK } from "cardano-raw-sdk";
import { Networks, SupportedAssets } from "cardano-raw-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

async function demonstrateCaching() {
  const sdk = await FireblocksCardanoRawSDK.createInstance({
    fireblocksConfig: {
      apiKey: process.env.FIREBLOCKS_API_KEY!,
      secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
      basePath: BasePath.US,
    },
    vaultAccountId: "vault-123",
    network: Networks.MAINNET,
    iagonApiKey: process.env.IAGON_API_KEY!,
  });

  // Check cache statistics
  const stats = sdk.getCacheStats();
  console.log(`Cache stats: ${stats.addressCount} addresses, ${stats.publicKeyCount} public keys`);

  // Multiple operations benefit from caching
  const balance1 = await sdk.getBalanceByAddress({ index: 0 });
  const balance2 = await sdk.getBalanceByAddress({ index: 0 });
  // Second balance check uses cached address - no Fireblocks API call!

  // Clear cache if needed
  sdk.clearCache();

  await sdk.shutdown();
}

demonstrateCaching();
```

### Example 5: Transfer Native ADA

```typescript
import { FireblocksCardanoRawSDK } from "cardano-raw-sdk";
import { Networks } from "cardano-raw-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

async function transferAda() {
  const sdk = await FireblocksCardanoRawSDK.createInstance({
    fireblocksConfig: {
      apiKey: process.env.FIREBLOCKS_API_KEY!,
      secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
      basePath: BasePath.US,
    },
    vaultAccountId: "vault-123",
    network: Networks.MAINNET,
    iagonApiKey: process.env.IAGON_API_KEY!,
  });

  try {
    // Estimate fee first
    const feeEstimate = await sdk.estimateAdaTransactionFee({
      index: 0,
      recipientAddress: "addr1qxy...",
      adaAmount: 5000000, // 5 ADA
    });
    console.log("Estimated Fee:", feeEstimate.fee.ada, "ADA");

    // Execute transfer
    const result = await sdk.transferAda({
      index: 0,
      recipientAddress: "addr1qxy...",
      adaAmount: 5000000,
    });

    console.log("ADA Transfer successful!");
    console.log("Transaction Hash:", result.txHash);
    console.log("Actual Fee:", result.fee.ada, "ADA");
  } catch (error) {
    console.error("Transfer failed:", error);
  } finally {
    await sdk.shutdown();
  }
}

transferAda();
```

### Example 6: Multi-Token Transfer

```typescript
import { FireblocksCardanoRawSDK } from "cardano-raw-sdk";
import { Networks } from "cardano-raw-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

async function transferMultipleTokens() {
  const sdk = await FireblocksCardanoRawSDK.createInstance({
    fireblocksConfig: {
      apiKey: process.env.FIREBLOCKS_API_KEY!,
      secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
      basePath: BasePath.US,
    },
    vaultAccountId: "vault-123",
    network: Networks.MAINNET,
    iagonApiKey: process.env.IAGON_API_KEY!,
  });

  try {
    const result = await sdk.transferMultipleTokens({
      index: 0,
      recipientAddress: "addr1qxy...",
      tokens: [
        {
          policyId: "f0ff48bbb7bbe9d5...",
          assetName: "4e4654",
          amount: 1000000,
        },
        {
          policyId: "a1b2c3d4e5f6...",
          assetName: "544f4b454e",
          amount: 500000,
        },
      ],
      includeAda: true,
      adaAmount: 2000000, // Also send 2 ADA
    });

    console.log("Multi-token transfer successful!");
    console.log("Transaction Hash:", result.txHash);
    console.log("Fee:", result.fee.ada, "ADA");
  } catch (error) {
    console.error("Transfer failed:", error);
  } finally {
    await sdk.shutdown();
  }
}

transferMultipleTokens();
```

### Example 7: UTxO Consolidation

```typescript
import { FireblocksCardanoRawSDK } from "cardano-raw-sdk";
import { Networks } from "cardano-raw-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

async function consolidateUtxos() {
  const sdk = await FireblocksCardanoRawSDK.createInstance({
    fireblocksConfig: {
      apiKey: process.env.FIREBLOCKS_API_KEY!,
      secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
      basePath: BasePath.US,
    },
    vaultAccountId: "vault-123",
    network: Networks.MAINNET,
    iagonApiKey: process.env.IAGON_API_KEY!,
  });

  try {
    const result = await sdk.consolidateUtxos({
      index: 0,
      // targetAddress: "addr1qxy..." // Optional: defaults to source address
    });

    console.log("UTxO consolidation successful!");
    console.log("Transaction Hash:", result.txHash);
    console.log("Consolidated", result.inputCount, "UTxOs");
    console.log("Fee:", result.fee.ada, "ADA");
  } catch (error) {
    console.error("Consolidation failed:", error);
  } finally {
    await sdk.shutdown();
  }
}

consolidateUtxos();
```

### Example 8: Governance Operations

```typescript
import { FireblocksCardanoRawSDK } from "cardano-raw-sdk";
import { Networks } from "cardano-raw-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

async function participateInGovernance() {
  const sdk = await FireblocksCardanoRawSDK.createInstance({
    fireblocksConfig: {
      apiKey: process.env.FIREBLOCKS_API_KEY!,
      secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
      basePath: BasePath.US,
    },
    vaultAccountId: "vault-123",
    network: Networks.MAINNET,
    iagonApiKey: process.env.IAGON_API_KEY!,
  });

  try {
    // Register as a DRep (requires 500 ADA deposit)
    const drepResult = await sdk.registerAsDRep({
      vaultAccountId: "vault-123",
      index: 0,
      anchor: {
        url: "https://example.com/drep-metadata.json",
        dataHash: "abc123...",
      },
    });
    console.log("Registered as DRep:", drepResult.drepId);
    console.log("Transaction Hash:", drepResult.txHash);

    // Cast a vote on a governance action
    const voteResult = await sdk.castGovernanceVote({
      vaultAccountId: "vault-123",
      index: 0,
      governanceActionTxHash: "abc123...",
      governanceActionIndex: 0,
      vote: "yes", // or "no" or "abstain"
    });
    console.log("Vote cast! TX Hash:", voteResult.txHash);

    // Delegate voting power to another DRep
    const delegateResult = await sdk.delegateToDRep({
      vaultAccountId: "vault-123",
      index: 0,
      drepId: "drep1...",
    });
    console.log("Delegated to DRep! TX Hash:", delegateResult.txHash);
  } catch (error) {
    console.error("Governance operation failed:", error);
  } finally {
    await sdk.shutdown();
  }
}

participateInGovernance();
```

## Development

### Setup Development Environment

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode with hot reload
npm run dev

# Generate documentation
npm run docs
```

### Project Structure

```
cardano-raw-sdk/
├── src/
│   ├── FireblocksCardanoRawSDK.ts       # Main SDK class
│   ├── pool/
│   │   └── sdkManager.ts         # Connection pooling manager
│   ├── services/
│   │   ├── fireblocks.service.ts # Fireblocks integration
│   │   └── iagon.api.service.ts  # Iagon API client
│   ├── api/
│   │   ├── router.ts             # Express routes
│   │   └── controllers/
│   │       └── controller.ts     # API controllers
│   ├── types/                    # TypeScript type definitions
│   ├── utils/                    # Utility functions
│   └── server.ts                 # Express server setup
├── docs/                         # Generated documentation
├── Dockerfile                    # Docker configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Docker Deployment

#### Build Docker Image

```bash
docker build -t cardano-raw-sdk:latest .
```

#### Run the Container

```bash
# Start the service
docker run -d --name cardano-raw-sdk \
  --env-file .env \
  -p 8000:8000 \
  -v "$PWD/secrets:/app/secrets:ro" \
  cardano-raw-sdk:latest

# View logs
docker logs -f cardano-raw-sdk

# Stop the service
docker stop cardano-raw-sdk

# Restart the service
docker restart cardano-raw-sdk
```

## Advanced Features

### Intelligent Caching

The SDK implements automatic caching to minimize Fireblocks API calls:

- **Address Caching**: Vault account addresses are cached by index
- **Public Key Caching**: Public keys are cached per asset/change/address combination
- **Automatic Cache Management**: Caches are cleared on SDK shutdown
- **Manual Cache Control**: Use `clearCache()` and `getCacheStats()` methods

```typescript
// Check cache statistics
const stats = sdk.getCacheStats();
console.log("Cached addresses:", stats.addressCount);
console.log("Cached public keys:", stats.publicKeyCount);

// Clear cache manually if needed
sdk.clearCache();
```

**Benefits:**

- Reduces API calls to Fireblocks by up to 90%
- Faster response times for repeated operations
- Lower costs and improved rate limit compliance
- Automatic per-vault-account isolation via SDK pooling

### Connection Pooling

The SDK Manager implements intelligent connection pooling:

- **LRU Eviction**: Automatically removes least-recently-used idle connections
- **Automatic Cleanup**: Periodically removes idle connections
- **Per-Vault Instances**: Each vault account gets its own SDK instance
- **Metrics**: Track pool usage and performance

### Error Handling

```typescript
try {
  const result = await sdk.transfer({ ... });
} catch (error) {
  if (error.code === 'INSUFFICIENT_BALANCE') {
    console.error('Insufficient balance:', error.details);
  } else if (error instanceof SdkApiError) {
    console.error('API Error:', error.statusCode, error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Network Support

- **Mainnet**: Production Cardano network (use `Networks.MAINNET`)
- **Preprod**: Pre-production testnet (use `Networks.PREPROD`)
- **Preview**: Preview testnet (not currently supported)

### Advanced SDK Methods

The SDK provides additional methods for advanced use cases:

```typescript
// Access internal services for advanced operations
const fireblocksService = sdk.getFireblocksService();
const iagonApiService = sdk.getIagonApiService();

// Cache management
sdk.clearCache(); // Clear all cached addresses and public keys
const stats = sdk.getCacheStats(); // Get cache statistics

// Graceful shutdown
await sdk.shutdown(); // Clean up resources and clear cache
```

## Troubleshooting

### Common Issues

1. **"SDK factory not initialized" error**
   - Ensure you're passing the SDK factory function to SdkManager constructor
   - Check that FireblocksCardanoRawSDK.createInstance is properly imported

2. **"Insufficient balance" error**
   - Ensure sufficient ADA for transaction fees (minimum ~1.2 ADA)
   - Verify token balance is sufficient for the transfer amount

3. **Docker container fails to start**
   - Check that the secret key path is correct and file is readable
   - Verify all required environment variables are set
   - Check Docker logs: `docker logs -f cardano-raw-sdk`

## Deployment Considerations

### UTXO Locking Limitation

The SDK uses **in-memory UTXO locking** to prevent double-spend within a single process. When a UTXO is selected for a transaction, it is temporarily locked (default: 2 minutes) to prevent concurrent transactions from selecting the same UTXO.

**Important for multi-replica deployments:**

This in-memory lock only works within a single Node.js process. If you run multiple replicas/instances of the API service (e.g., in Kubernetes, Docker Swarm, or behind a load balancer), concurrent requests to different replicas may select the same UTXO, causing one transaction to fail.

**Mitigation strategies:**

1. **Sticky Sessions**: Route requests for the same vault account to the same replica using session affinity (e.g., based on `vaultAccountId`)

2. **External Locking**: Implement distributed locking using Redis, a database, or another external coordination service

3. **Single Replica**: For low-traffic deployments, run a single replica to ensure in-memory locks are effective

4. **Sequential Processing**: Queue transactions for the same vault account to process them sequentially

```typescript
// Example: The SDK locks UTXOs automatically
const result1 = await sdk.transferAda({ ... }); // UTXO locked during tx
const result2 = await sdk.transferAda({ ... }); // Different UTXO selected
// Locks automatically release after transaction completes or TTL expires
```

## Security Considerations

- ⚠️ Never commit `.env` files or secret keys to version control
- ⚠️ Store Fireblocks secret keys in secure locations with restricted permissions
- ⚠️ Enable Fireblocks transaction approval policies for production

## License

[MIT License](LICENSE)
