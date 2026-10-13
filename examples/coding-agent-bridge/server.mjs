import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { validateLivePolicy, buildWalletEnv } from './security.mjs';
import { assertPinnedProtocolFee, restrictTokenRegistry, createRestrictedFetch } from './server-runtime.mjs';

const require = createRequire(import.meta.url);
const serverEntry = require.resolve('agentpay-mcp');
// Resolve from the server itself so restrictions apply to its SDK instance.
const serverRequire = createRequire(serverEntry);
const sdk = serverRequire('agentwallet-sdk');
const policy = validateLivePolicy(JSON.parse(process.env.STARTER_BRIDGE_POLICY ?? 'null'));
const env = buildWalletEnv(process.env);
assertPinnedProtocolFee(sdk);
restrictTokenRegistry(sdk.getGlobalRegistry(), env.CHAIN_ID);
globalThis.fetch = createRestrictedFetch(policy.allowedEndpoints, env.RPC_URL);
await import(pathToFileURL(serverEntry).href);
