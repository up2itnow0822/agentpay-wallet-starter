import { X402_PROTOCOL_FEE_BPS, X402_PROTOCOL_FEE_COLLECTOR, protocolFeeAmount } from './security.mjs';

const USDC = Object.freeze({ '84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e', '8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' });

export function assertPinnedProtocolFee(sdk) {
  if (sdk.X402_PROTOCOL_FEE_BPS !== X402_PROTOCOL_FEE_BPS || sdk.X402_PROTOCOL_FEE_COLLECTOR !== X402_PROTOCOL_FEE_COLLECTOR || typeof sdk.x402ProtocolFeeAmount !== 'function' || typeof sdk.x402DebitAmount !== 'function') throw new Error('Pinned server protocol fee contract does not match.');
  // Exercise floor boundaries and large integer amounts without floating point.
  for (const principal of [0n, 1n, 129n, 130n, 999_999n, 1_000_000n, 9_007_199_254_740n]) {
    const fee = protocolFeeAmount(principal);
    if (sdk.x402ProtocolFeeAmount(principal) !== fee || sdk.x402DebitAmount(principal) !== principal + fee) throw new Error('Pinned server protocol fee arithmetic does not match.');
  }
}

export function restrictTokenRegistry(registry, chainId) {
  const expected = USDC[chainId];
  const token = registry.getToken('USDC', Number(chainId));
  if (!expected || !token || token.decimals !== 6 || token.address.toLowerCase() !== expected.toLowerCase()) throw new Error('Pinned server USDC registry contract does not match.');
  const allowed = Object.freeze({ ...token });
  registry.getToken = (symbol, id) => id === Number(chainId) && typeof symbol === 'string' && symbol.toUpperCase() === 'USDC' ? allowed : undefined;
  registry.getTokenByAddress = (address, id) => id === Number(chainId) && typeof address === 'string' && address.toLowerCase() === expected.toLowerCase() ? allowed : undefined;
  registry.listTokens = id => id === Number(chainId) ? [allowed] : [];
  registry.getAllTokens = () => [allowed];
  registry.addToken = () => { throw new Error('Bridge token registry is immutable and USDC-only.'); };
  Object.freeze(registry);
}

export function createRestrictedFetch(endpoints, rpcUrl, fetchImpl = globalThis.fetch) {
  const allowed = new Set([...endpoints, rpcUrl].map(value => new URL(value).href));
  return async (input, init = {}) => {
    const value = input instanceof Request ? input.url : String(input);
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !allowed.has(url.href)) throw new Error('Bridge child HTTP destination is not allowed.');
    const response = await fetchImpl(input, { ...init, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) throw new Error('Bridge child HTTP redirects are blocked.');
    return response;
  };
}
