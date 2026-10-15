import test from 'node:test';
import assert from 'node:assert/strict';
import { restrictTokenRegistry, createRestrictedFetch } from './server-runtime.mjs';

const usdc = { symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, chainId: 84532, name: 'USDC' };
test('child payment selection resolves USDC only on its configured chain', () => {
  const registry = {
    getToken: (_symbol?: string, _chain?: number) => usdc,
    getTokenByAddress: (_address?: string, _chain?: number) => ({ ...usdc, symbol: 'WETH', decimals: 18 }),
    listTokens: () => [usdc], getAllTokens: () => [usdc],
    addToken: (_token?: unknown) => {},
  };
  restrictTokenRegistry(registry, '84532');
  assert.equal(registry.getToken('USDC', 84532)?.address, usdc.address);
  assert.equal(registry.getToken('WETH', 84532), undefined);
  assert.equal(registry.getToken('USDC', 8453), undefined);
  assert.equal(registry.getTokenByAddress(usdc.address, 84532)?.decimals, 6);
  assert.equal(registry.getTokenByAddress(`0x${'2'.repeat(40)}`, 84532), undefined);
  assert.throws(() => registry.addToken({}), /immutable/i);
});

test('child fetch permits exact approved endpoints and RPC but blocks redirects and other hosts', async () => {
  const calls: Array<{ url: string; redirect: string }> = [];
  const fetchImpl: typeof fetch = async (url, init) => { calls.push({ url: String(url), redirect: init?.redirect ?? '' }); return new Response('ok'); };
  const fetcher = createRestrictedFetch(['https://merchant.example/data'], 'https://sepolia.base.org', fetchImpl);
  await fetcher('https://merchant.example/data');
  await fetcher('https://sepolia.base.org', { method: 'POST' });
  assert.deepEqual(calls.map(x => x.redirect), ['manual', 'manual']);
  await assert.rejects(fetcher('https://merchant.example/other'));
  await assert.rejects(fetcher('https://merchant.example.evil/data'));
  await assert.rejects(fetcher('http://merchant.example/data'));
  await assert.rejects(fetcher('https://user:password@merchant.example/data'));
  const redirecting = createRestrictedFetch(['https://merchant.example/data'], 'https://sepolia.base.org', async () => new Response('', { status: 302, headers: { Location: 'https://evil.example' } }));
  await assert.rejects(redirecting('https://merchant.example/data'), /redirect/i);
});
