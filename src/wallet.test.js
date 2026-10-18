import test from 'node:test';
import assert from 'node:assert/strict';
import { collectInjectedWallets, requestEvmWalletAccount } from './wallet.js';

test('wallet discovery exposes OKX, MetaMask, and distinct legacy providers', () => {
  const metamask = { isMetaMask: true, request() {} };
  const okx = { isOkxWallet: true, request() {} };
  const other = { request() {} };
  const found = collectInjectedWallets({ okxwallet: okx, ethereum: { providers: [metamask, okx, other] } });
  assert.deepEqual(found.map((wallet) => wallet.name), ['OKX Wallet', 'MetaMask', 'Injected EVM Wallet']);
  assert.equal(found[0].provider, okx);
});

test('connection requests accounts and chain from the provider the user selected', async () => {
  const calls = [];
  const provider = { request: async ({ method }) => {
    calls.push(method);
    if (method === 'eth_requestAccounts') return [`0x${'a'.repeat(40)}`];
    if (method === 'eth_chainId') return '0xa8231';
  } };
  assert.deepEqual(await requestEvmWalletAccount(provider), { address: `0x${'a'.repeat(40)}`, chainId: '0xa8231' });
  assert.deepEqual(calls, ['eth_requestAccounts', 'eth_chainId']);
});

test('connection rejects empty accounts and preserves wallet rejection errors', async () => {
  await assert.rejects(requestEvmWalletAccount({ request: async () => [] }), /no valid EVM account/i);
  const rejection = Object.assign(new Error('User rejected request'), { code: 4001 });
  await assert.rejects(requestEvmWalletAccount({ request: async () => { throw rejection; } }), (error) => error.code === 4001);
});
