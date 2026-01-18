# Fireblocks Iagon SDK

A TypeScript SDK for managing Cardano token transfers through Fireblocks, with integrated Iagon API services for balance queries, transaction history, and token operations.

## Features

- 🔐 **Fireblocks Integration**: Secure vault account management and transaction signing
- 🏦 **Balance Queries**: Check balances by address, credential, or stake key
- 💸 **Token Transfers**: Execute Cardano native token transfers with automatic UTXO selection
- 📊 **Transaction History**: Retrieve basic and detailed transaction history with pagination
- 🔄 **Connection Pooling**: Efficient SDK instance management with automatic cleanup
- 🌐 **Multi-Network Support**: Works with Cardano mainnet, preprod, and preview networks
- 🚀 **REST API Server**: Optional Express server for HTTP-based operations
- 🐳 **Docker Support**: Easy deployment with Docker and Docker Compose

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
- Docker & Docker Compose (for API service deployment)
- Fireblocks API credentials
- Iagon API key (optional, for enhanced features)

### Install as a TypeScript Package

```bash
npm install @iagon/fireblocks-cardano-sdk
```

Or clone the repository:

```bash
git clone https://github.com/iagon/fireblocks-iagon-sdk.git
cd fireblocks-iagon-sdk
npm install
```

## Usage Methods

### Method 1: TypeScript SDK

Use the SDK directly in your TypeScript/JavaScript application.

#### Basic Setup

```typescript
import { CardanoTokensSDK } from "@iagon/fireblocks-cardano-sdk";
import { Networks, SupportedAssets } from "@iagon/fireblocks-cardano-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

// Initialize the SDK
const sdk = await CardanoTokensSDK.createInstance({
  fireblocksConfig: {
    apiKey: "your-fireblocks-api-key",
    secretKey: "your-fireblocks-secret-key",
    basePath: BasePath.US,
  },
  vaultAccountId: "your-vault-account-id",
  network: Networks.MAINNET,
});
```

#### Get Balance

```typescript
// Get balance by address
const balance = await sdk.getBalanceByAddress(SupportedAssets.ADA, {
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

#### Transfer Tokens

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
```

**Note**: You must provide exactly one of `recipientAddress` or `recipientVaultAccountId`, not both.

#### Transaction History

```typescript
// Get basic transaction history
const history = await sdk.getTransactionHistory(SupportedAssets.ADA, 0, {
  limit: 10,
  offset: 0,
  fromSlot: 100000,
});

// Get detailed transaction history with inputs/outputs
const detailedHistory = await sdk.getDetailedTxHistory(SupportedAssets.ADA, 0, {
  limit: 10,
  offset: 0,
});

// Get transaction details by hash
const txDetails = await sdk.getTransactionDetails(
  "6c9e6d70a0ce7ca5d..."
);
```

#### Vault Account Operations

```typescript
// Get vault account addresses
const addresses = await sdk.getVaultAccountAddresses(SupportedAssets.ADA);

// Get public key
const publicKey = await sdk.getPublicKey(SupportedAssets.ADA, 0, 0);

// Broadcast a raw transaction
const result = await sdk.broadcastTransaction(transactionRequest);
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
   git clone https://github.com/iagon/fireblocks-iagon-sdk.git
   cd fireblocks-iagon-sdk
   ```

2. **Configure environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start the service**:

   ```bash
   docker-compose up -d
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

##### Transaction Operations

```bash
# Get transaction details by hash
GET /api/tx/hash/:hash

# Get transaction history
GET /api/tx/history/:vaultAccountId?index=0&limit=10&offset=0&fromSlot=100000

# Get detailed transaction history
GET /api/tx/address/:vaultAccountId?index=0&limit=10&offset=0

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

##### Example cURL Commands

```bash
# Get balance
curl http://localhost:8000/api/balance/address/vault-123?assetId=ADA&index=0

# Get transaction history
curl http://localhost:8000/api/tx/history/vault-123?limit=5

# Execute transfer (to address)
curl -X POST http://localhost:8000/api/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "vault-123",
    "recipientAddress": "addr1qxy...",
    "tokenPolicyId": "f0ff48bbb...",
    "tokenName": "4e49...",
    "requiredTokenAmount": 1000000
  }'

# Execute transfer (vault-to-vault)
curl -X POST http://localhost:8000/api/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "vaultAccountId": "0",
    "recipientVaultAccountId": "1",
    "tokenPolicyId": "f0ff48bbb...",
    "tokenName": "4e49...",
    "requiredTokenAmount": 1000000
  }'
```

## Configuration

### Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```bash
# Server Configuration
PORT=8000

# Fireblocks Configuration (Required)
FIREBLOCKS_API_USER_KEY=your-api-key
FIREBLOCKS_API_USER_SECRET_KEY_PATH=/path/to/fireblocks_secret.key
FIREBLOCKS_BASE_PATH=https://api.fireblocks.io

# Cardano Network Configuration
CARDANO_NETWORK=mainnet  # Options: mainnet, preprod, preview

# SDK Pool Configuration
POOL_MAX_SIZE=100
POOL_IDLE_TIMEOUT_MS=1800000        # 30 minutes
POOL_CLEANUP_INTERVAL_MS=300000     # 5 minutes
POOL_CONNECTION_TIMEOUT_MS=30000    # 30 seconds
POOL_RETRY_ATTEMPTS=3

# Optional: Iagon API Configuration
IAGON_API_KEY=your-iagon-api-key

# Optional: Blockfrost Configuration
BLOCKFROST_PROJECT_ID=your-blockfrost-project-id
```

### Fireblocks Secret Key

Store your Fireblocks secret key in a secure file:

```bash
# Create a secure directory
mkdir -p ~/.fireblocks

# Save your secret key
echo "YOUR_FIREBLOCKS_SECRET_KEY" > ~/.fireblocks/secret.key

# Set proper permissions
chmod 600 ~/.fireblocks/secret.key

# Update .env
FIREBLOCKS_API_USER_SECRET_KEY_PATH=/home/user/.fireblocks/secret.key
```

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
import { CardanoTokensSDK } from "@iagon/fireblocks-cardano-sdk";
import { Networks, SupportedAssets } from "@iagon/fireblocks-cardano-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

async function transferTokens() {
  const sdk = await CardanoTokensSDK.createInstance({
    fireblocksConfig: {
      apiKey: process.env.FIREBLOCKS_API_KEY!,
      secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
      basePath: BasePath.US,
    },
    vaultAccountId: "vault-123",
    network: Networks.MAINNET,
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
import { SdkManager } from "@iagon/fireblocks-cardano-sdk/pool";
import { CardanoTokensSDK } from "@iagon/fireblocks-cardano-sdk";
import { Networks } from "@iagon/fireblocks-cardano-sdk/types";
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
    CardanoTokensSDK.createInstance({
      fireblocksConfig,
      vaultAccountId,
      network,
    })
);

// Get SDK for a vault account (automatically pooled)
const sdk1 = await manager.getSdk("vault-123");
const balance1 = await sdk1.getBalanceByAddress();

// Reuses the same SDK instance
const sdk2 = await manager.getSdk("vault-123");
const balance2 = await sdk2.getBalanceByAddress();

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
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

getBalanceAndTransfer();
```

### Example 4: Using Cache for Performance

```typescript
import { CardanoTokensSDK } from "@iagon/fireblocks-cardano-sdk";
import { Networks, SupportedAssets } from "@iagon/fireblocks-cardano-sdk/types";
import { BasePath } from "@fireblocks/ts-sdk";

async function demonstrateCaching() {
  const sdk = await CardanoTokensSDK.createInstance({
    fireblocksConfig: {
      apiKey: process.env.FIREBLOCKS_API_KEY!,
      secretKey: process.env.FIREBLOCKS_SECRET_KEY!,
      basePath: BasePath.US,
    },
    vaultAccountId: "vault-123",
    network: Networks.MAINNET,
  });

  // Check cache statistics
  const stats = sdk.getCacheStats();
  console.log(`Cache stats: ${stats.addressCount} addresses, ${stats.publicKeyCount} public keys`);

  // Multiple operations benefit from caching
  const balance1 = await sdk.getBalanceByAddress(SupportedAssets.ADA, { index: 0 });
  const balance2 = await sdk.getBalanceByAddress(SupportedAssets.ADA, { index: 0 });
  // Second balance check uses cached address - no Fireblocks API call!

  // Clear cache if needed
  sdk.clearCache();

  await sdk.shutdown();
}

demonstrateCaching();
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

# Run tests
npm test

# Generate documentation
npm run docs

# Lint code
npm run lint
```

### Project Structure

```
fireblocks-iagon-sdk/
├── src/
│   ├── CardanoTokensSDK.ts       # Main SDK class
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
├── docker-compose.yml            # Docker Compose setup
├── package.json
├── tsconfig.json
└── README.md
```

### Docker Deployment

#### Build Docker Image

```bash
docker build -t fireblocks-iagon-sdk:latest .
```

#### Run with Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Restart services
docker-compose restart
```

#### Docker Compose Configuration

```yaml
version: "3.8"

services:
  fireblocks-sdk:
    build: .
    ports:
      - "8000:8000"
    environment:
      - PORT=8000
      - CARDANO_NETWORK=mainnet
      - POOL_MAX_SIZE=100
    env_file:
      - .env
    volumes:
      - ./fireblocks_secret.key:/app/fireblocks_secret.key:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
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
  } else if (error instanceof IagonApiError) {
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
   - Check that CardanoTokensSDK.createInstance is properly imported

2. **"Address not found" error**
   - Verify the vault account ID exists in Fireblocks
   - Check that the asset ID matches the network (ADA for mainnet, ADA_TEST for testnet)

3. **"Insufficient balance" error**
   - Ensure sufficient ADA for transaction fees (minimum ~1.2 ADA)
   - Verify token balance is sufficient for the transfer amount

4. **Docker container fails to start**
   - Check that the secret key path is correct and file is readable
   - Verify all required environment variables are set
   - Check Docker logs: `docker-compose logs -f`

## Security Considerations

- ⚠️ Never commit `.env` files or secret keys to version control
- ⚠️ Store Fireblocks secret keys in secure locations with restricted permissions
- ⚠️ Use environment-specific API keys (separate for dev/prod)
- ⚠️ Enable Fireblocks transaction approval policies for production
- ⚠️ Implement rate limiting on API endpoints in production
- ⚠️ Use HTTPS/TLS for all production deployments

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

## License

[MIT License](LICENSE)

## Support

- 📧 Email: support@iagon.com
- 📚 Documentation: [https://docs.iagon.com](https://docs.iagon.com)
- 🐛 Issues: [GitHub Issues](https://github.com/iagon/fireblocks-iagon-sdk/issues)

## Acknowledgments

- [Fireblocks](https://www.fireblocks.com/) for secure custody infrastructure
- [Cardano](https://cardano.org/) blockchain
- [Emurgo](https://emurgo.io/) for Cardano serialization libraries
- [Iagon](https://iagon.com/) for API services
