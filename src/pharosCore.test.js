import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWalletChain, calculateFeeWei, feeHistoryBlockIndexes, inspectPharosMcpTools, mcpFallbackStatus, parseEthToWei, parseRpcResponse, receiptOutcome, schedulerTrigger, savingsReport, summarizeGasHistory, validateTransaction, weiToGwei } from './pharosCore.js';

test('wei and Gwei conversions retain expected precision for display', () => {
  assert.equal(weiToGwei(1_500_000_000n), 1.5);
  assert.equal(parseEthToWei('0.000000000000000001'), 1n);
  assert.throws(() => parseEthToWei('0.0000000000000000001'));
});

test('transaction fees use integer gas units times wei per gas', () => {
  assert.equal(calculateFeeWei(21_000n, 2_000_000_000n), 42_000_000_000_000n);
});

test('validation rejects malformed address, calldata, value, deadline, target, and raw tx', () => {
  const valid = { to: `0x${'a'.repeat(40)}`, data: '0x00ff', valueEth: '0.1', targetGasGwei: 2, deadlineSeconds: 10, rawSignedTxHex: '0x1234' };
  assert.doesNotThrow(() => validateTransaction(valid));
  for (const change of [{ to: '0x123' }, { data: '0x0' }, { valueEth: '-1' }, { deadlineSeconds: 0 }, { targetGasGwei: Infinity }, { rawSignedTxHex: '0xxyz' }]) {
    assert.throws(() => validateTransaction({ ...valid, ...change }));
  }
});

test('gas history aggregation ignores unavailable values', () => {
  assert.deepEqual(summarizeGasHistory([{ gasGwei: 2 }, { gasGwei: 4 }, { gasGwei: null }]), { min: 2, max: 4, avg: 3 });
  assert.deepEqual(summarizeGasHistory([]), { min: null, max: null, avg: null });
});

test('fee history base fee array maps blocks and excludes the trailing next-block fee', () => {
  assert.deepEqual(feeHistoryBlockIndexes({ baseFeePerGas: ['0x1', '0x2', '0x3'] }, 100), [
    { blockNumber: 100, baseFeePerGas: '0x1' }, { blockNumber: 101, baseFeePerGas: '0x2' }
  ]);
});

test('scheduler has deterministic triggers and ignores jobs already executing', () => {
  const job = { status: 'queued', targetGasGwei: 2, deadlineAtMs: 1000 };
  assert.equal(schedulerTrigger(job, 1, 0), 'FAVORABLE_GAS');
  assert.equal(schedulerTrigger(job, 3, 1000), 'DEADLINE_REACHED');
  assert.equal(schedulerTrigger({ ...job, status: 'executing' }, 1, 0), null);
  assert.equal(schedulerTrigger(job, 3, 999), null);
});

test('savings are computed from actual receipt gas used and fee price', () => {
  assert.deepEqual(savingsReport({ requestGasPriceWei: 3n, actualGasPriceWei: 2n, gasUsed: 10n }), {
    projectedRequestFeeWei: 30n, actualFeeWei: 20n, realizedSavingsWei: 10n
  });
});

test('Pharos MCP catalog requires the published gas tools and their expected schema', () => {
  const payload = { result: { tools: [
    { name: 'get_gas_price', inputSchema: { properties: {} } },
    { name: 'estimate_gas', inputSchema: { properties: { transaction: { type: 'object' } } } }
  ] } };
  assert.deepEqual(inspectPharosMcpTools(payload), { gasTool: 'get_gas_price', estimateTool: 'estimate_gas' });
  assert.throws(() => inspectPharosMcpTools({ result: { tools: [] } }), /unavailable/);
  assert.throws(() => inspectPharosMcpTools({ error: { message: 'tool error' } }), /tool error/);
  assert.throws(() => inspectPharosMcpTools({ result: {} }), /Malformed/);
});

test('JSON-RPC response validation rejects malformed, mismatched, and error payloads', () => {
  assert.equal(parseRpcResponse({ jsonrpc: '2.0', id: 7, result: '0x1' }, 7), '0x1');
  assert.throws(() => parseRpcResponse({ jsonrpc: '1.0', id: 7, result: '0x1' }, 7), /Malformed/);
  assert.throws(() => parseRpcResponse({ jsonrpc: '2.0', id: 8, result: '0x1' }, 7), /Malformed/);
  assert.throws(() => parseRpcResponse({ jsonrpc: '2.0', id: 7, error: { message: 'unavailable' } }, 7), /unavailable/);
});

test('wallet chain checks and receipt lifecycle distinguish pending, success, and revert', () => {
  assert.doesNotThrow(() => assertWalletChain('0xa8231', '0xA8231'));
  assert.throws(() => assertWalletChain('0x688', '0xa8231'), /expected/);
  assert.deepEqual(receiptOutcome(null), { status: 'submitted', actualFeeWei: null, effectiveGasPriceWei: null, gasUsed: null });
  assert.deepEqual(receiptOutcome({ status: '0x1', gasUsed: '0x5208', effectiveGasPrice: '0x3b9aca00' }), {
    status: 'confirmed', gasUsed: 21000n, effectiveGasPriceWei: 1_000_000_000n, actualFeeWei: 21_000_000_000_000n
  });
  assert.equal(receiptOutcome({ status: '0x0', gasUsed: '0x5208', effectiveGasPrice: '0x3b9aca00' }).status, 'failed');
});

test('MCP failure reports direct RPC fallback without a false connected state', () => {
  const status = mcpFallbackStatus(new Error('offline'));
  assert.equal(status.connected, false);
  assert.equal(status.available, false);
  assert.match(status.engine, /RPC fallback/);
  assert.equal(status.reason, 'offline');
});
