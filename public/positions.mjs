import { encodeFunctionData, decodeFunctionResult, parseAbi, encodeAbiParameters, keccak256 } from 'viem';

export const NETWORKS = {
  'bsc-pancake-v3': {
    id: 'bsc-pancake-v3', label: 'BSC · PancakeSwap v3', chainId: 56, version: 3,
    positionManager: '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364',
    factory: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
    rpcs: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed-public.bnbchain.org'],
    host: 'pancakeswap.finance', chainSlug: 'bsc',
  },
  'bsc-uniswap-v3': {
    id: 'bsc-uniswap-v3', label: 'BSC · Uniswap v3', chainId: 56, version: 3,
    positionManager: '0x7b8a01b39d58278b5de7e48c8449c9f4f5170613',
    factory: '0xdb1d10011ad0ff90774d0c6bb92e5c5c8b4461f7',
    rpcs: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed-public.bnbchain.org'],
    host: 'app.uniswap.org', chainSlug: 'bnb',
  },
  'bsc-uniswap-v4': {
    id: 'bsc-uniswap-v4', label: 'BSC · Uniswap v4', chainId: 56, version: 4,
    positionManager: '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b',
    stateView: '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4',
    rpcs: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed-public.bnbchain.org'],
    host: 'app.uniswap.org', chainSlug: 'bnb',
  },
  'robinhood-uniswap-v3': {
    id: 'robinhood-uniswap-v3', label: 'Robinhood · Uniswap v3', chainId: 4663, version: 3,
    positionManager: '0x73991a25c818bf1f1128deaab1492d45638de0d3',
    factory: '0x1f7d7550b1b028f7571e69a784071f0205fd2efa',
    rpcs: ['https://rpc.mainnet.chain.robinhood.com', 'https://robinhood-rpc.publicnode.com'],
    host: 'app.uniswap.org', chainSlug: 'robinhood',
  },
  'robinhood-uniswap-v4': {
    id: 'robinhood-uniswap-v4', label: 'Robinhood · Uniswap v4', chainId: 4663, version: 4,
    positionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7',
    stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',
    rpcs: ['https://rpc.mainnet.chain.robinhood.com', 'https://robinhood-rpc.publicnode.com'],
    host: 'app.uniswap.org', chainSlug: 'robinhood',
  },
};

const abi = parseAbi([
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function getPool(address token0, address token1, uint24 fee) view returns (address)',
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getPositionLiquidity(uint256 tokenId) view returns (uint128)',
  'function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 info)',
  'function getLiquidity(bytes32 poolId) view returns (uint128)',
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
]);
const ZERO = '0x0000000000000000000000000000000000000000';
class ReadError extends Error {
  constructor(message, retryable = false) { super(message); this.retryable = retryable; }
}

export function validateRpcUrl(input = '') {
  if (!input.trim()) return '';
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('RPC 地址格式不正确，请填写完整的 HTTPS 地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('RPC 需使用 HTTPS，且不能包含用户名、密码或 # 片段。');
  }
  return url.href;
}

export function parsePositionInput(input, networkId) {
  const network = NETWORKS[networkId];
  if (!network) throw new Error('请选择支持的网络与平台。');
  let id = String(input).trim();
  if (!/^\d+$/.test(id)) {
    let url;
    try { url = new URL(id); } catch { throw new Error('请填写仓位详情链接，或纯数字 NFT 编号。'); }
    if (url.protocol !== 'https:' || url.hostname !== network.host || url.port || url.username || url.password) {
      throw new Error('链接与所选平台不符，请切换平台或填写该平台的 NFT 编号。');
    }
    if (url.searchParams.has('permissioned')) throw new Error('暂不支持 Permissioned 仓位，请使用标准仓位。');
    if (network.host === 'pancakeswap.finance') {
      const match = url.pathname.match(/^\/liquidity\/(\d+)\/?$/);
      const chains = [...url.searchParams.getAll('chain'), ...url.searchParams.getAll('network')];
      if (!match || chains.some(chain => !['bsc', '56'].includes(chain))) throw new Error('请使用 BSC PancakeSwap v3 的单个仓位详情链接。');
      id = match[1];
    } else if (network.host === 'app.uniswap.org') {
      const match = url.pathname.match(/^\/positions\/v([34])\/([^/]+)\/(\d+)\/?$/);
      if (!match || Number(match[1]) !== network.version || match[2] !== network.chainSlug) throw new Error('链接的网络或版本与当前选择不符，请切换后重试。');
      id = match[3];
    } else {
      throw new Error('该平台请直接填写 NFT 编号。');
    }
  }
  const tokenId = BigInt(id);
  if (tokenId <= 0n || tokenId >= 2n ** 256n) throw new RangeError('NFT 编号需为有效的正整数。');
  return tokenId;
}

export function calculateActiveShare({ positionLiquidity, poolLiquidity, tick, tickLower, tickUpper }) {
  if (typeof positionLiquidity !== 'bigint' || typeof poolLiquidity !== 'bigint' || positionLiquidity <= 0n || poolLiquidity < 0n) {
    throw new RangeError('这个仓位没有流动性，请检查 NFT 编号或是否已撤出。');
  }
  if (![tick, tickLower, tickUpper].every(Number.isInteger) || tickLower >= tickUpper) throw new RangeError('仓位区间数据无效，请重试。');
  const inRange = tickLower <= tick && tick < tickUpper;
  if (!inRange) return { inRange: false, activePercent: 0 };
  if (poolLiquidity === 0n || positionLiquidity > poolLiquidity) throw new RangeError('池子流动性数据不一致，请重试或更换 RPC。');
  const scale = 10n ** 20n;
  const activePercent = Number(positionLiquidity * 100n * scale / poolLiquidity) / Number(scale);
  return { inRange: true, activePercent };
}

export function unpackTicks(info) {
  return { tickLower: Number(BigInt.asIntN(24, info >> 8n)), tickUpper: Number(BigInt.asIntN(24, info >> 32n)) };
}

export async function readActivePosition({ networkId, position, customRpc = '', signal, fetchImpl = fetch, timeoutMs = 10000 }) {
  const network = NETWORKS[networkId];
  const tokenId = parsePositionInput(position, networkId);
  const custom = validateRpcUrl(customRpc);
  const endpoints = custom ? [custom] : network.rpcs;
  let lastError;
  for (let index = 0; index < endpoints.length; index++) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    let requestId = 0;
    const rpc = async (method, params = []) => {
      const id = ++requestId;
      let response, payload;
      try {
        response = await fetchImpl(endpoints[index], {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer',
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: controller.signal,
        });
        if (!response.ok) throw new Error('http');
        payload = await response.json();
      } catch {
        throw new ReadError('RPC 连接失败或超时，请重试，或展开设置更换支持浏览器访问的 RPC。', true);
      }
      if (!payload || typeof payload !== 'object' || payload.id !== id || payload.jsonrpc !== '2.0' || payload.error || payload.result === undefined) {
        const isRevert = payload?.error?.code === 3 || /revert/i.test(String(payload?.error?.message || ''));
        throw new ReadError(isRevert ? '未读到该仓位，请检查网络、平台、版本和 NFT 编号，仓位也可能已销毁。' : 'RPC 未返回有效数据，请重试或更换 RPC。', !isRevert);
      }
      return payload.result;
    };
    try {
      const chain = await rpc('eth_chainId');
      if (typeof chain !== 'string' || !/^0x[0-9a-f]+$/i.test(chain)) throw new ReadError('RPC 返回的网络编号无效，请更换节点。', true);
      if (BigInt(chain) !== BigInt(network.chainId)) throw new ReadError('RPC 所属网络与当前选择不一致，请检查地址。', !custom);
      const blockNumber = await rpc('eth_blockNumber');
      if (!/^0x[0-9a-f]+$/i.test(blockNumber)) throw new ReadError('RPC 返回的区块无效，请更换节点。', true);
      const read = async (address, functionName, args = []) => {
        const data = encodeFunctionData({ abi, functionName, args });
        const result = await rpc('eth_call', [{ to: address, data }, blockNumber]);
        try { return decodeFunctionResult({ abi, functionName, data: result }); }
        catch { throw new ReadError('合约返回数据不完整，请检查所选平台或更换 RPC。', true); }
      };
      let positionLiquidity, poolLiquidity, tick, tickLower, tickUpper, pool, hooks = ZERO;
      if (network.version === 4) {
        const [details, liquidity] = await Promise.all([
          read(network.positionManager, 'getPoolAndPositionInfo', [tokenId]),
          read(network.positionManager, 'getPositionLiquidity', [tokenId]),
          read(network.positionManager, 'ownerOf', [tokenId]),
        ]);
        const [key, info] = details;
        ({ tickLower, tickUpper } = unpackTicks(info));
        hooks = key.hooks;
        pool = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
        positionLiquidity = liquidity;
        const [active, slot] = await Promise.all([read(network.stateView, 'getLiquidity', [pool]), read(network.stateView, 'getSlot0', [pool])]);
        poolLiquidity = active; tick = slot[1];
      } else {
        const details = await read(network.positionManager, 'positions', [tokenId]);
        [, , , , , tickLower, tickUpper, positionLiquidity] = details;
        pool = await read(network.factory, 'getPool', [details[2], details[3], details[4]]);
        if (pool.toLowerCase() === ZERO) throw new ReadError('未找到对应池子，请检查平台和 NFT 编号。');
        const [active, slot] = await Promise.all([read(pool, 'liquidity'), read(pool, 'slot0')]);
        poolLiquidity = active; tick = slot[1];
      }
      const share = calculateActiveShare({ positionLiquidity, poolLiquidity, tick, tickLower, tickUpper });
      const block = await rpc('eth_getBlockByNumber', [blockNumber, false]);
      if (!block?.timestamp || !/^0x[0-9a-f]+$/i.test(block.timestamp)) throw new ReadError('无法确认数据时间，请更换 RPC。', true);
      const timestamp = Number(BigInt(block.timestamp)) * 1000;
      if (!Number.isFinite(timestamp) || Date.now() - timestamp > 300000 || timestamp > Date.now() + 60000) throw new ReadError('RPC 数据超过 5 分钟或时间异常，请换节点后重试。', true);
      signal?.throwIfAborted();
      return { ...share, networkId, tokenId: tokenId.toString(), pool, tick, tickLower, tickUpper, positionLiquidity, poolLiquidity, hooks,
        supportedFees: hooks.toLowerCase() === ZERO, blockNumber: BigInt(blockNumber).toString(), timestamp,
        rpcSource: custom ? '自定义 RPC' : index === 0 ? '默认公共 RPC' : '备用公共 RPC' };
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error instanceof ReadError || error instanceof RangeError ? error : new ReadError('读取失败，请检查仓位编号，或更换 RPC 后重试。');
      if (!lastError.retryable) throw lastError;
    } finally {
      clearTimeout(timer); controller.abort(); signal?.removeEventListener('abort', abort);
    }
  }
  throw lastError;
}
