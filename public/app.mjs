import { calculatePosition, incrementalAprAt, validateInputs } from './model.mjs';

const keys = ['capital', 'activePercent', 'aprPercent', 'additional'];
const fields = Object.fromEntries(keys.map(key => [key, document.getElementById(key)]));
const form = document.getElementById('calculator-form');
const slider = document.getElementById('additional-slider');
const chart = document.getElementById('apr-chart');
const chartContainer = document.getElementById('chart-container');
let currentInput = null;
let currentResult = null;
let sliderMaximum = 6000;
let hasEdited = false;

const byId = id => document.getElementById(id);
const number = (value, decimals = 2) => {
  if (value > 0 && value < 10 ** -decimals) return value.toPrecision(3);
  if (Math.abs(value) >= 1e9) return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value);
};
const percentage = value => `${number(value)}%`;
const money = (value, decimals = 2) => `${number(value, decimals)} U`;
const readInputs = () => Object.fromEntries(keys.map(key => [key, fields[key].value === '' ? NaN : fields[key].valueAsNumber]));

function setFact(id, value, unit) {
  byId(id).replaceChildren(document.createTextNode(value));
  const suffix = document.createElement('span');
  suffix.textContent = unit;
  byId(id).append(suffix);
}

function updateSlider(input, resize) {
  if (resize) sliderMaximum = Math.min(1e12, Math.max(input.capital * 3, input.additional * 1.25, 0.000003));
  slider.max = String(sliderMaximum);
  slider.value = String(input.additional);
  slider.setAttribute('aria-valuetext', money(input.additional, 6));
  slider.style.setProperty('--fill', `${input.additional / sliderMaximum * 100}%`);
  byId('slider-end').textContent = money(sliderMaximum, 6);
}

function update(resizeSlider = false) {
  const input = readInputs();
  const errors = validateInputs(input);
  for (const key of keys) {
    fields[key].setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
    const error = byId(`${key}-error`);
    error.hidden = !errors[key];
    error.textContent = errors[key] || '';
  }
  const invalid = Object.keys(errors).length > 0;
  byId('invalid-state').hidden = !invalid;
  byId('valid-results').hidden = invalid;
  slider.disabled = invalid;
  byId('input-state').textContent = hasEdited ? '使用你输入的参数' : '当前为示例参数';
  if (invalid) { byId('mobile-apr').textContent = '待计算'; currentInput = null; currentResult = null; return; }
  const result = calculatePosition(input);
  currentInput = input;
  currentResult = result;
  updateSlider(input, resizeSlider);
  byId('increment-apr').textContent = result.incrementApr === null ? '尚未追加' : number(result.incrementApr);
  byId('mobile-apr').textContent = result.incrementApr === null ? '尚未追加' : percentage(result.incrementApr);
  byId('apr-suffix').hidden = result.incrementApr === null;
  byId('result-sentence').textContent = result.incrementApr === null
    ? `输入追加金额，查看这笔钱的年化。当前小额加仓的年化约 ${percentage(result.instantAprBefore)}。`
    : `追加 ${money(input.additional, 6)}，模型折算每年多赚 ${money(result.extraAnnualFees, 4)} 手续费。`;
  setFact('active-after', number(result.activeAfter, 4), '%');
  setFact('extra-daily', number(result.extraDailyFees, 4), 'U');
  setFact('instant-after', number(result.instantAprAfter), '%');
  const rows = {
    'capital-before': money(input.capital, 6),
    'capital-after': money(result.capitalAfter, 6),
    'active-before': percentage(input.activePercent),
    'active-after': percentage(result.activeAfter),
    'apr-before': percentage(input.aprPercent),
    'apr-after': percentage(result.averageAprAfter),
    'fees-before': money(result.annualFeesBefore, 4),
    'fees-after': money(result.totalAnnualFeesAfter, 4),
  };
  for (const [id, value] of Object.entries(rows)) byId(`table-${id}`).textContent = value;
  drawChart();
}

function svgElement(tag, attrs, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawChart() {
  if (!currentInput || !currentResult) return;
  const input = currentInput;
  const width = Math.max(240, chartContainer.clientWidth);
  const height = width < 430 ? 240 : 253;
  const left = width < 430 ? 50 : 58, right = width - 14, top = 28, bottom = height - 47;
  const maxApr = currentResult.instantAprBefore || 1;
  const yTop = maxApr * 1.18;
  const x = value => left + 5 + value / sliderMaximum * (right - left - 10);
  const y = value => bottom - 5 - value / yTop * (bottom - top - 10);
  const fragment = document.createDocumentFragment();
  const add = (tag, attrs, text) => { const node = svgElement(tag, attrs, text); fragment.append(node); return node; };
  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.setAttribute('height', String(height));
  add('title', {}, '不同追加金额对应的整笔新增资金手续费 APR');
  add('desc', {}, `原仓位 ${money(input.capital)}，份额 ${percentage(input.activePercent)}，手续费年化 ${percentage(input.aprPercent)}。追加 ${money(input.additional)} 时，新增年化 ${currentResult.incrementApr === null ? '尚未定义，小额极限为 ' + percentage(currentResult.instantAprBefore) : percentage(currentResult.incrementApr)}。`);
  add('text', { x: left, y: 15 }, '新增资金 APR（%）');
  add('rect', { x: left, y: top, width: right - left, height: bottom - top, fill: 'none', stroke: '#e0e6ef' });
  for (let i = 0; i <= 3; i++) {
    const value = maxApr * i / 3;
    add('line', { x1: left, x2: right, y1: y(value), y2: y(value), stroke: '#e0e6ef', 'stroke-width': .7 });
    add('text', { x: left - 9, y: y(value) + 4, 'text-anchor': 'end' }, number(value, 1));
  }
  const tickCount = width < 500 ? 3 : 4;
  for (let i = 0; i <= tickCount; i++) {
    const value = sliderMaximum * i / tickCount;
    add('text', { x: x(value), y: bottom + 20, 'text-anchor': i === 0 ? 'start' : i === tickCount ? 'end' : 'middle' }, number(value, 1));
  }
  add('text', { x: (left + right) / 2, y: height - 4, 'text-anchor': 'middle' }, '追加本金（U）');
  const points = Array.from({ length: 121 }, (_, i) => {
    const amount = sliderMaximum * i / 120;
    return [x(amount), y(incrementalAprAt(input, amount))];
  });
  const path = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(3)},${py.toFixed(3)}`).join(' ');
  add('path', { d: `${path} L${points.at(-1)[0]},${bottom - 5} L${points[0][0]},${bottom - 5} Z`, fill: '#2859d9', 'fill-opacity': .045 });
  add('path', { d: path, fill: 'none', stroke: '#2859d9', 'stroke-width': 2.5 });
  const value = currentResult.incrementApr ?? currentResult.instantAprBefore;
  const px = x(input.additional), py = y(value);
  add('line', { x1: px, x2: px, y1: py, y2: bottom - 5, stroke: '#809ace', 'stroke-dasharray': '3 4' });
  add('circle', { cx: px, cy: py, r: 5, fill: '#2859d9', stroke: 'white', 'stroke-width': 2 });
  const label = add('text', { x: px + 10, y: Math.max(top + 15, py - 14), class: 'point-label' }, currentResult.incrementApr === null ? `小额极限 ${percentage(value)}` : `${percentage(value)}`);
  chart.replaceChildren(fragment);
  const bbox = label.getBBox();
  if (bbox.x + bbox.width > right - 5) label.setAttribute('x', String(Math.max(left + 5, right - bbox.width - 5)));
}

form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', event => {
  if (event.target === slider) return;
  hasEdited = true;
  update(event.target === fields.capital || event.target === fields.additional);
});
slider.addEventListener('input', () => {
  hasEdited = true;
  const amount = Math.min(sliderMaximum, Math.max(0, Number(slider.value)));
  const precision = Math.max(2, Math.min(8, Math.ceil(-Math.log10(sliderMaximum)) + 5));
  fields.additional.value = String(Number(amount.toFixed(precision)));
  update(false);
});
new ResizeObserver(drawChart).observe(chartContainer);
update(true);

// Optional page-scoped tooling shares the same validation and visible state.
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifetime = new AbortController();
  const tool = {
    name: 'configure_marginal_apr_calculation',
    title: '设置 LP 边际年化参数',
    description: 'Set the four calculator inputs, update the visible result, and return the fee APR estimate. No transaction or network request is made.',
    inputSchema: {
      type: 'object',
      properties: {
        capital: { type: 'number', minimum: 0.000001, maximum: 1e12 },
        activePercent: { type: 'number', minimum: 0.00000001, maximum: 100 },
        aprPercent: { type: 'number', minimum: 0, maximum: 1000000 },
        additional: { type: 'number', minimum: 0, maximum: 1e12 },
      },
      required: keys,
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      const result = calculatePosition(input);
      for (const key of keys) fields[key].value = String(input[key]);
      hasEdited = true;
      update(true);
      return result;
    },
  };
  try { Promise.resolve(modelContext.registerTool(tool, { signal: lifetime.signal })).catch(() => {}); } catch { /* The calculator works without optional tool support. */ }
  window.addEventListener('pagehide', () => lifetime.abort(), { once: true });
}
