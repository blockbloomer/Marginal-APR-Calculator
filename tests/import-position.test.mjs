import test from 'node:test';
import assert from 'node:assert/strict';
import { setupPositionImport } from '../public/import-position.mjs';

function positionResult(tokenId = '42') {
  return {
    tokenId, timestamp: Date.now(), blockNumber: '123', rpcSource: '测试节点',
    inRange: true, supportedFees: true, activePercent: 35,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(t, readPosition = async ({ position }) => positionResult(position)) {
  const nodes = new Map();
  function byId(id) {
    if (!nodes.has(id)) nodes.set(id, {
      value: id === 'position-id' ? '42' : '', dataset: {}, handlers: {}, attributes: {},
      addEventListener(event, handler) { this.handlers[event] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      add(option) { if (!this.value) this.value = option.value; },
      focus() { this.focused = true; },
    });
    return nodes.get(id);
  }
  const replacements = {
    document: { getElementById: byId },
    window: { addEventListener() {} },
    Option: class { constructor(label, value) { this.label = label; this.value = value; } },
  };
  const originals = Object.fromEntries(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const reads = [];
  let clearCount = 0;
  const importer = setupPositionImport({
    readPosition,
    onRead: (result, changedPosition) => reads.push({ result, changedPosition }),
    onClear: () => { clearCount++; },
  });
  return {
    importer, byId, reads,
    get clearCount() { return clearCount; },
    submit: () => byId('position-form').handlers.submit({ preventDefault() {} }),
    dispatch: (id, event) => byId(id).handlers[event](),
  };
}

test('a linked position refresh preserves matching inputs while another NFT clears them', async t => {
  const page = fixture(t);
  await page.submit();
  await page.submit();
  page.byId('position-id').value = '43';
  page.dispatch('position-id', 'input');
  await page.submit();
  assert.deepEqual(page.reads.map(({ changedPosition }) => changedPosition), [true, false, true]);
});

test('manual Active edits detach capital and APR before the same NFT is read again', async t => {
  const page = fixture(t);
  await page.submit();
  page.importer.manualEdit();
  await page.submit();
  assert.deepEqual(page.reads.map(({ changedPosition }) => changedPosition), [true, true]);

  page.byId('custom-rpc').value = 'https://rpc.example.test';
  page.dispatch('custom-rpc', 'input');
  page.importer.manualEdit();
  await page.submit();
  assert.equal(page.reads.at(-1).changedPosition, true, 'Manual edits must detach even after a query was invalidated');
});

test('the manual-entry button clears the linked Active value and focuses its input', async t => {
  const page = fixture(t);
  await page.submit();
  const before = page.clearCount;
  page.dispatch('manual-active', 'click');
  assert.equal(page.clearCount, before + 1);
  assert.equal(page.byId('activePercent').focused, true);
  await page.submit();
  assert.equal(page.reads.at(-1).changedPosition, true);
});

test('an old response cannot overwrite a newer query even if its reader ignores abort', async t => {
  const first = deferred();
  const second = deferred();
  const requests = [];
  const page = fixture(t, request => {
    requests.push(request);
    return requests.length === 1 ? first.promise : second.promise;
  });
  const firstSubmission = page.submit();
  page.byId('position-id').value = '43';
  page.dispatch('position-id', 'input');
  assert.equal(requests[0].signal.aborted, true);
  const secondSubmission = page.submit();
  second.resolve(positionResult('43'));
  await secondSubmission;
  const latestMessage = page.byId('lookup-status').textContent;
  first.resolve(positionResult('42'));
  await firstSubmission;
  assert.deepEqual(page.reads.map(({ result }) => result.tokenId), ['43']);
  assert.equal(page.byId('lookup-status').textContent, latestMessage);
  assert.equal(page.byId('read-position').disabled, false);
  assert.equal(page.byId('position-form').attributes['aria-busy'], 'false');
});

test('switching to manual input cancels an in-flight read without restoring its value', async t => {
  const pending = deferred();
  let request;
  const page = fixture(t, input => { request = input; return pending.promise; });
  const submission = page.submit();
  page.importer.manualEdit();
  assert.equal(request.signal.aborted, true);
  const manualMessage = page.byId('lookup-status').textContent;
  pending.resolve(positionResult());
  await submission;
  assert.equal(page.reads.length, 0);
  assert.equal(page.byId('lookup-status').textContent, manualMessage);
  assert.equal(page.byId('read-position').disabled, false);
});
