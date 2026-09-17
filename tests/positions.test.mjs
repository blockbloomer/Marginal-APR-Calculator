import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeFunctionResult, keccak256, parseAbi, toFunctionSelector } from 'viem';
import { NETWORKS, parsePositionInput, validateRpcUrl, calculateActiveShare, unpackTicks, readActivePosition } from '../public/positions.mjs';

const network = Object.values(NETWORKS).find(entry => entry.id === 'bsc-pancake-v3');
const customRpc = 'https://rpc.example.test/v1/browser-only-key';
const token0 = '0x0000000000000000000000000000000000000011';
const token1 = '0x0000000000000000000000000000000000000022';
const pool = '0x0000000000000000000000000000000000000033';
const zero = '0x0000000000000000000000000000000000000000';
const abi = parseAbi([
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getPositionLiquidity(uint256 tokenId) view returns (uint128)',
  'function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 info)',
  'function getLiquidity(bytes32 poolId) view returns (uint128)',
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
]);
const selectors = Object.fromEntries(abi.map(item => [toFunctionSelector(item), item.name]));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

function jsonReply(request, result) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createRpc({ intercept, tick = 0, positionLiquidity = 7n, poolLiquidity = 20n, hooks = zero } = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const request = JSON.parse(options.body);
    const record = { url: String(url), request, options };
    requests.push(record);
    const intercepted = await intercept?.(record);
    if (intercepted !== undefined) return intercepted;
    let result;
    if (request.method === 'eth_chainId') result = `0x${network.chainId.toString(16)}`;
    else if (request.method === 'eth_blockNumber') result = '0x123';
    else if (request.method === 'eth_getBlockByNumber') result = { number: request.params[0], timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}` };
    else if (request.method === 'eth_call') {
      const call = request.params[0];
      const name = selectors[call.data.slice(0, 10)];
      const values = {
        positions: [0n, zero, token0, token1, 500, -100, 100, positionLiquidity, 0n, 0n, 0n, 0n],
        getPool: pool,
        liquidity: poolLiquidity,
        slot0: [2n ** 96n, tick, 0, 1, 1, 0, true],
        ownerOf: token0,
        getPositionLiquidity: positionLiquidity,
        getPoolAndPositionInfo: [
          { currency0: token0, currency1: token1, fee: 500, tickSpacing: 10, hooks },
          (0xabcdef1234567890n << 56n) | (100n << 32n) | (BigInt.asUintN(24, -100n) << 8n),
        ],
        getLiquidity: poolLiquidity,
        getSlot0: [2n ** 96n, tick, 0, 500],
      };
      assert.ok(name && name in values, `Unexpected contract call ${call.data.slice(0, 10)}`);
      result = encodeFunctionResult({ abi, functionName: name, result: values[name] });
    } else assert.fail(`Unexpected RPC method ${request.method}`);
    return jsonReply(request, result);
  };
  return { fetchImpl, requests };
}

test('position input accepts exact positive uint256 IDs and recognized BSC position links', () => {
  assert.equal(parsePositionInput(' 42 ', network.id), 42n);
  assert.equal(parsePositionInput(String(2n ** 256n - 1n), network.id), 2n ** 256n - 1n);
  assert.equal(parsePositionInput('https://pancakeswap.finance/liquidity/42?chain=bsc', network.id), 42n);
  for (const input of ['', '0', '-1', '1.5', '1e3', String(2n ** 256n), '0x2a']) {
    assert.throws(() => parsePositionInput(input, network.id), undefined, input);
  }
});

test('position links reject foreign origins, unsupported versions, and different networks', () => {
  for (const input of [
    'https://pancakeswap.finance.evil.example/liquidity/42?chain=bsc',
    'https://evil.example/liquidity/42?chain=bsc',
    'https://pancakeswap.finance/v2/liquidity/42?chain=bsc',
    'https://pancakeswap.finance/liquidity/42?chain=eth',
    'https://pancakeswap.finance/liquidity/42?chain=ronin',
  ]) assert.throws(() => parsePositionInput(input, network.id), undefined, input);
  assert.throws(() => parsePositionInput('42', 'unsupported-network'));
});

test('custom RPC accepts HTTPS API keys but rejects insecure URLs and embedded credentials', () => {
  assert.equal(validateRpcUrl('  '), '');
  assert.equal(validateRpcUrl(' https://rpc.example.test '), 'https://rpc.example.test/');
  assert.equal(validateRpcUrl('https://rpc.example.test/v1/key?apiKey=local-only'), 'https://rpc.example.test/v1/key?apiKey=local-only');
  for (const input of ['http://rpc.example.test', 'wss://rpc.example.test', 'javascript:alert(1)', 'file:///tmp/key', 'https://user:secret@rpc.example.test', 'not a url']) {
    assert.throws(() => validateRpcUrl(input), undefined, input);
  }
});

test('active share includes the lower tick and excludes the upper tick', () => {
  const position = { positionLiquidity: 7n, poolLiquidity: 20n, tickLower: -100, tickUpper: 100 };
  assert.deepEqual(calculateActiveShare({ ...position, tick: -100 }), { inRange: true, activePercent: 35 });
  assert.deepEqual(calculateActiveShare({ ...position, tick: 99 }), { inRange: true, activePercent: 35 });
  for (const tick of [-101, 100]) {
    assert.deepEqual(calculateActiveShare({ ...position, tick }), { inRange: false, activePercent: 0 });
  }
  assert.deepEqual(calculateActiveShare({ ...position, tick: 100, positionLiquidity: 30n }), { inRange: false, activePercent: 0 });
});

test('active share preserves large liquidity ratios and rejects impossible active snapshots', () => {
  const base = { tick: 0, tickLower: -100, tickUpper: 100 };
  close(calculateActiveShare({ ...base, positionLiquidity: 7n * 10n ** 36n, poolLiquidity: 20n * 10n ** 36n }).activePercent, 35);
  close(calculateActiveShare({ ...base, positionLiquidity: 2n ** 127n, poolLiquidity: 2n ** 128n - 1n }).activePercent, 50);
  for (const liquidity of [
    { positionLiquidity: 0n, poolLiquidity: 20n },
    { positionLiquidity: 7n, poolLiquidity: 0n },
    { positionLiquidity: 21n, poolLiquidity: 20n },
  ]) assert.throws(() => calculateActiveShare({ ...base, ...liquidity }));
});

test('v4 position info decodes signed ticks independently of subscriber and pool bits', () => {
  const pack = (lower, upper) => (0xabcdef1234567890n << 56n) | (BigInt.asUintN(24, BigInt(upper)) << 32n) | (BigInt.asUintN(24, BigInt(lower)) << 8n) | 1n;
  assert.deepEqual(unpackTicks(pack(-887272, 887272)), { tickLower: -887272, tickUpper: 887272 });
  assert.deepEqual(unpackTicks(pack(-240, -120)), { tickLower: -240, tickUpper: -120 });
  assert.deepEqual(unpackTicks(pack(0, 120)), { tickLower: 0, tickUpper: 120 });
});

test('RPC reads use one pinned block, the configured contracts, and no browser credentials', async () => {
  const rpc = createRpc();
  const result = await readActivePosition({ networkId: network.id, position: '42', customRpc, fetchImpl: rpc.fetchImpl });
  close(result.activePercent, 35);
  assert.equal(result.inRange, true);
  assert.equal(rpc.requests.filter(({ request }) => request.method === 'eth_blockNumber').length, 1);
  const calls = rpc.requests.filter(({ request }) => request.method === 'eth_call');
  assert.equal(calls.length, 4);
  for (const { request, options, url } of rpc.requests) {
    assert.equal(url, customRpc);
    assert.equal(options.credentials, 'omit');
    if (request.method === 'eth_call') assert.equal(request.params[1], '0x123');
  }
  const destinations = Object.fromEntries(calls.map(({ request }) => [selectors[request.params[0].data.slice(0, 10)], request.params[0].to.toLowerCase()]));
  assert.equal(destinations.positions, network.positionManager.toLowerCase());
  assert.equal(destinations.getPool, network.factory.toLowerCase());
  assert.equal(destinations.slot0, pool);
  assert.equal(destinations.liquidity, pool);
});

test('out-of-range RPC positions produce zero Active instead of an in-range estimate', async () => {
  const rpc = createRpc({ tick: 100, positionLiquidity: 30n, poolLiquidity: 20n });
  const result = await readActivePosition({ networkId: network.id, position: '42', customRpc, fetchImpl: rpc.fetchImpl });
  assert.equal(result.inRange, false);
  assert.equal(result.activePercent, 0);
});

test('v4 uses the complete PoolKey hash for StateView and marks custom hooks explicitly', async () => {
  const v4 = NETWORKS['bsc-uniswap-v4'];
  assert.ok(v4);
  for (const hooks of [zero, '0x0000000000000000000000000000000000000044']) {
    const rpc = createRpc({ hooks });
    const result = await readActivePosition({ networkId: v4.id, position: '42', customRpc, fetchImpl: rpc.fetchImpl });
    const expectedPoolId = keccak256(encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
      [token0, token1, 500, 10, hooks],
    ));
    close(result.activePercent, 35);
    assert.equal(result.pool, expectedPoolId);
    assert.equal(result.tickLower, -100);
    assert.equal(result.tickUpper, 100);
    assert.equal(result.hooks.toLowerCase(), hooks);
    assert.equal(result.supportedFees, hooks === zero);
    const calls = rpc.requests.filter(({ request }) => request.method === 'eth_call');
    assert.equal(calls.length, 5);
    const stateCalls = calls.filter(({ request }) => ['getLiquidity', 'getSlot0'].includes(selectors[request.params[0].data.slice(0, 10)]));
    assert.equal(stateCalls.length, 2);
    for (const { request } of stateCalls) {
      assert.equal(request.params[0].to.toLowerCase(), v4.stateView.toLowerCase());
      assert.equal(`0x${request.params[0].data.slice(10)}`, expectedPoolId);
    }
    for (const { request } of calls) assert.equal(request.params[1], '0x123');
  }
});

test('a custom RPC on another chain is rejected before reading the position', async () => {
  const rpc = createRpc({ intercept: ({ request }) => request.method === 'eth_chainId' ? jsonReply(request, '0x1') : undefined });
  await assert.rejects(readActivePosition({ networkId: network.id, position: '42', customRpc, fetchImpl: rpc.fetchImpl }));
  assert.equal(rpc.requests.filter(({ request }) => request.method === 'eth_call').length, 0);
  assert.ok(rpc.requests.every(({ url }) => url === customRpc));
});

test('public RPC fallback restarts the entire snapshot with the replacement block', async () => {
  assert.ok(network.rpcs.length >= 2, 'BSC should have a public RPC fallback');
  const primary = network.rpcs[0];
  const fallback = network.rpcs[1];
  const rpc = createRpc({ intercept: ({ url, request }) => {
    if (url === primary && request.method === 'eth_call' && selectors[request.params[0].data.slice(0, 10)] === 'getPool') throw new TypeError('Failed to fetch');
    if (url === fallback && request.method === 'eth_blockNumber') return jsonReply(request, '0x124');
    return undefined;
  } });
  const result = await readActivePosition({ networkId: network.id, position: '42', fetchImpl: rpc.fetchImpl });
  close(result.activePercent, 35);
  const second = rpc.requests.filter(({ url }) => url === fallback);
  assert.equal(second.filter(({ request }) => request.method === 'eth_blockNumber').length, 1);
  assert.ok(second.some(({ request }) => request.method === 'eth_call' && selectors[request.params[0].data.slice(0, 10)] === 'positions'));
  for (const { request } of second.filter(({ request }) => request.method === 'eth_call')) assert.equal(request.params[1], '0x124');
});

test('malformed public RPC envelopes and chain IDs still try the backup endpoint', async () => {
  for (const malformed of ['null-envelope', 'invalid-chain-id']) {
    const rpc = createRpc({ intercept: ({ url, request }) => {
      if (url !== network.rpcs[0] || request.method !== 'eth_chainId') return undefined;
      if (malformed === 'null-envelope') return new Response('null', { headers: { 'Content-Type': 'application/json' } });
      return jsonReply(request, 'not-a-chain-id');
    } });
    const result = await readActivePosition({ networkId: network.id, position: '42', fetchImpl: rpc.fetchImpl });
    close(result.activePercent, 35);
    assert.ok(rpc.requests.some(({ url }) => url === network.rpcs[1]), malformed);
  }
});

test('a failing custom RPC never falls back or exposes its URL or API key in errors', async () => {
  const secret = 'private-query-key-123';
  const endpoint = `https://rpc.example.test/v1/${secret}?apiKey=${secret}`;
  const urls = [];
  await assert.rejects(readActivePosition({
    networkId: network.id,
    position: '42',
    customRpc: endpoint,
    fetchImpl: async url => {
      urls.push(String(url));
      throw new Error(`request failed at ${url}`);
    },
  }), error => {
    assert.ok(error.message.length > 0);
    assert.ok(!error.message.includes(secret));
    assert.ok(!error.message.includes(endpoint));
    return true;
  });
  assert.ok(urls.length > 0);
  assert.ok(urls.every(url => url === endpoint));
});

test('stale or future block timestamps cannot be presented as a current Active snapshot', async () => {
  for (const offsetSeconds of [-600, 600]) {
    const rpc = createRpc({ intercept: ({ request }) => {
      if (request.method !== 'eth_getBlockByNumber') return undefined;
      return jsonReply(request, { number: request.params[0], timestamp: `0x${(Math.floor(Date.now() / 1000) + offsetSeconds).toString(16)}` });
    } });
    await assert.rejects(readActivePosition({ networkId: network.id, position: '42', customRpc, fetchImpl: rpc.fetchImpl }));
  }
});

test('an already aborted import makes no RPC requests', async () => {
  const controller = new AbortController();
  controller.abort();
  const rpc = createRpc();
  await assert.rejects(readActivePosition({ networkId: network.id, position: '42', signal: controller.signal, fetchImpl: rpc.fetchImpl }));
  assert.equal(rpc.requests.length, 0);
});

test('RPC requests time out and cancel the pending fetch', { timeout: 1500 }, async () => {
  let aborted = false;
  const fetchImpl = (_url, { signal }) => new Promise((resolve, reject) => {
    const watchdog = setTimeout(() => reject(new Error('Test watchdog: fetch was not cancelled')), 500);
    const onAbort = () => {
      aborted = true;
      clearTimeout(watchdog);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
  await assert.rejects(readActivePosition({ networkId: network.id, position: '42', customRpc, timeoutMs: 20, fetchImpl }));
  assert.equal(aborted, true);
});
