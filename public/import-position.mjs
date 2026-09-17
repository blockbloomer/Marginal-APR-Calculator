import { NETWORKS, parsePositionInput, readActivePosition } from './positions.mjs';

export function setupPositionImport({ onRead, onClear, readPosition = readActivePosition }) {
  const byId = id => document.getElementById(id);
  const form = byId('position-form');
  const network = byId('position-network');
  const position = byId('position-id');
  const customRpc = byId('custom-rpc');
  const button = byId('read-position');
  const feedback = byId('lookup-feedback');
  const status = byId('lookup-status');
  let controller;
  let imported = false;
  let lastPositionKey;
  for (const item of Object.values(NETWORKS)) network.add(new Option(item.label, item.id));

  function message(text, state = '') {
    status.textContent = text;
    status.dataset.state = state;
    feedback.hidden = !text;
  }
  function cancel() {
    controller?.abort(); controller = undefined;
    button.disabled = false; button.textContent = '读取 Active';
    form.setAttribute('aria-busy', 'false');
  }
  function invalidate() {
    const hadQuery = Boolean(controller || imported);
    cancel();
    if (hadQuery) { imported = false; onClear(); message('查询条件已改变，请重新读取，或手动填写 Active。'); }
  }
  network.addEventListener('change', invalidate);
  customRpc.addEventListener('input', invalidate);
  position.addEventListener('input', () => {
    invalidate();
    if (!position.value.trim().startsWith('https://')) return;
    for (const item of Object.values(NETWORKS)) {
      try { parsePositionInput(position.value, item.id); network.value = item.id; break; } catch { /* Keep the current selection for unrecognized links. */ }
    }
  });
  byId('clear-rpc').addEventListener('click', () => {
    customRpc.value = ''; invalidate();
    message('已恢复公共 RPC，点击“读取 Active”即可查询。');
  });
  byId('manual-active').addEventListener('click', () => {
    cancel(); imported = false; lastPositionKey = undefined; onClear(); message('已切换手动填写。请填写当前成交处的活跃流动性份额。');
    byId('activePercent').focus();
  });
  function manualEdit() {
    lastPositionKey = undefined;
    if (!imported && !controller) return;
    cancel(); imported = false;
    message('当前 Active 为手动输入，已解除链上读取结果的关联。');
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); cancel();
    const pending = new AbortController(); controller = pending;
    const selected = network.value;
    const positionValue = position.value;
    button.disabled = true; button.textContent = '正在读取…';
    form.setAttribute('aria-busy', 'true');
    imported = false; onClear();
    message(customRpc.value.trim() ? '正在通过自定义 RPC 查询链上仓位，请稍候。' : '正在查询链上仓位，请稍候。公共节点繁忙时会尝试备用节点。');
    try {
      const result = await readPosition({ networkId: selected, position: positionValue, customRpc: customRpc.value, signal: pending.signal });
      if (controller !== pending) return;
      const time = new Date(result.timestamp).toLocaleString('zh-CN', { hour12: false });
      const source = `${NETWORKS[selected].label} · NFT #${result.tokenId} · 区块 ${result.blockNumber} · ${time} · ${result.rpcSource}`;
      if (!result.inRange) {
        message(`当前 Active 为 0%：仓位已出区间，暂不能用本模型估算同区间加仓。${source}`, 'error');
      } else if (!result.supportedFees) {
        message(`已读到 Active ${result.activePercent.toPrecision(7)}%，但池子带有自定义 Hook，手续费分配可能不同，暂不自动代入年化模型。${source}`, 'error');
      } else if (result.activePercent < 1e-8) {
        message(`Active 份额低于计算器支持的 0.00000001%，暂不自动代入。${source}`, 'error');
      } else {
        const key = `${selected}:${result.tokenId}`;
        const changedPosition = lastPositionKey !== key;
        lastPositionKey = key;
        imported = true;
        onRead(result, changedPosition);
        message(`已填入 Active ${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 8 }).format(result.activePercent)}%。${changedPosition ? '请补填这个 NFT 的当前本金与手续费 APR。' : '已刷新份额，请同时检查本金与手续费 APR。'} ${source}。这是查询时的快照，价格或流动性变化后请重新读取。`, 'success');
      }
    } catch (error) {
      if (controller === pending && !pending.signal.aborted) message(error.message, 'error');
    } finally {
      if (controller === pending) cancel();
    }
  });
  window.addEventListener('pagehide', () => { cancel(); customRpc.value = ''; });
  return { manualEdit };
}
