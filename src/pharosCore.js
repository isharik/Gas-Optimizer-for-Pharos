export function parseRpcQuantity(value, name = 'quantity') {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`Invalid RPC ${name}`);
  }
  return BigInt(value);
}

export function parseRpcResponse(payload, expectedId) {
  if (payload?.jsonrpc !== '2.0' || payload.id !== expectedId) throw new Error('Malformed JSON-RPC response');
  if (payload.error) throw new Error(payload.error.message || 'JSON-RPC request failed');
  if (!Object.hasOwn(payload, 'result')) throw new Error('JSON-RPC response has no result');
  return payload.result;
}

export function assertWalletChain(actualChainId, expectedChainId) {
  if (String(actualChainId).toLowerCase() !== String(expectedChainId).toLowerCase()) {
    throw new Error(`Wallet is on chain ${actualChainId}; expected ${expectedChainId}.`);
  }
}

export function receiptOutcome(receipt) {
  if (!receipt) return { status: 'submitted', actualFeeWei: null, effectiveGasPriceWei: null, gasUsed: null };
  const gasUsed = parseRpcQuantity(receipt.gasUsed, 'receipt gasUsed');
  const effectiveGasPriceWei = parseRpcQuantity(receipt.effectiveGasPrice, 'effectiveGasPrice');
  const succeeded = parseRpcQuantity(receipt.status, 'receipt status') === 1n;
  return { status: succeeded ? 'confirmed' : 'failed', gasUsed, effectiveGasPriceWei, actualFeeWei: gasUsed * effectiveGasPriceWei };
}

export function mcpFallbackStatus(error) {
  return { connected: false, available: false, latencyMs: null, engine: 'MCP unavailable · RPC fallback', reason: error?.message || String(error) };
}

export function weiToGwei(wei) {
  return Number(wei) / 1e9;
}

export function parseEthToWei(value) {
  const text = String(value);
  if (!/^\d+(\.\d{1,18})?$/.test(text)) throw new Error('Value must be a non-negative decimal with at most 18 places.');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 10n ** 18n + BigInt((fraction + '0'.repeat(18)).slice(0, 18));
}

export function calculateFeeWei(gasUnits, gasPriceWei) {
  if (gasUnits < 0n || gasPriceWei < 0n) throw new Error('Gas units and gas price must be non-negative.');
  return gasUnits * gasPriceWei;
}

export function validateTransaction({ to, data, valueEth, targetGasGwei, deadlineSeconds, rawSignedTxHex }) {
  if (!/^0x[a-f\d]{40}$/i.test(to)) throw new Error('Destination must be a valid 20-byte address.');
  if (typeof data !== 'string' || !/^0x(?:[a-f\d]{2})*$/i.test(data)) throw new Error('Calldata must be even-length hex prefixed with 0x.');
  parseEthToWei(valueEth);
  if (!Number.isFinite(Number(targetGasGwei)) || Number(targetGasGwei) <= 0) throw new Error('Gas target must be a positive finite number.');
  if (!Number.isSafeInteger(Number(deadlineSeconds)) || Number(deadlineSeconds) <= 0) throw new Error('Deadline must be a positive whole number of seconds.');
  if (rawSignedTxHex && !/^0x(?:[a-f\d]{2})+$/i.test(rawSignedTxHex)) throw new Error('Raw signed transaction must be non-empty even-length hex.');
}

export function summarizeGasHistory(points) {
  const values = points.map((point) => point.gasGwei).filter(Number.isFinite);
  if (!values.length) return { min: null, max: null, avg: null };
  return { min: Math.min(...values), max: Math.max(...values), avg: values.reduce((a, b) => a + b, 0) / values.length };
}

export function feeHistoryBlockIndexes(result, requestedStartBlock) {
  if (!Array.isArray(result?.baseFeePerGas)) return [];
  return result.baseFeePerGas.slice(0, -1).map((baseFeePerGas, index) => ({ blockNumber: requestedStartBlock + index, baseFeePerGas }));
}

export function schedulerTrigger(job, gasPriceGwei, nowMs) {
  if (job.status !== 'queued') return null;
  if (gasPriceGwei <= job.targetGasGwei) return 'FAVORABLE_GAS';
  if (nowMs >= job.deadlineAtMs) return 'DEADLINE_REACHED';
  return null;
}

export function inspectPharosMcpTools(payload) {
  if (payload?.error) throw new Error(payload.error.message || 'MCP tools/list failed');
  const tools = payload?.result?.tools;
  if (!Array.isArray(tools)) throw new Error('Malformed MCP tools/list response');
  const gas = tools.find((tool) => tool.name === 'get_gas_price');
  const estimate = tools.find((tool) => tool.name === 'estimate_gas');
  if (!gas || !estimate) throw new Error('Pharos gas tools are unavailable');
  if (Object.keys(gas.inputSchema?.properties || {}).length !== 0 || !Object.hasOwn(estimate.inputSchema?.properties || {}, 'transaction')) {
    throw new Error('Pharos gas tool schema is not supported');
  }
  return { gasTool: gas.name, estimateTool: estimate.name };
}

export function savingsReport({ requestGasPriceWei, actualGasPriceWei, gasUsed }) {
  const projectedRequestFeeWei = calculateFeeWei(gasUsed, requestGasPriceWei);
  const actualFeeWei = calculateFeeWei(gasUsed, actualGasPriceWei);
  return { projectedRequestFeeWei, actualFeeWei, realizedSavingsWei: projectedRequestFeeWei - actualFeeWei };
}
