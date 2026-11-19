"use strict";

const byId = (id) => document.getElementById(id);
const controls = ["search", "vendor", "form", "memory", "evidence-filter", "order"].map(byId);
const [search, vendor, form, memory, evidenceFilter, order] = controls;
const rows = JSON.parse(byId("catalog-data").textContent).map((record, id) => ({ ...record, id }));
const selection = new Set();
const perPage = 12;
const maxSelection = 3;
const fields = {
  form: "形态", memory: "显存", power: "功耗（W）", architecture: "架构 / 带宽",
  qwen: "Qwen 35B Q4 生成", prefill: "Qwen 35B 32K 预填充", llama: "Llama 2 7B 生成",
  fps: "1440p 光栅 / 光追 FPS", blender: "Blender 4.5 分数", sdxl: "SDXL 秒 / 张",
  workloads: "其他实测", cn: "大陆价格 / 预算（元）", us: "美国价格（美元）", sources: "核验来源",
};
const views = {
  overview: { columns: ["memory", "qwen", "blender", "fps", "cn"], note: "Qwen 生成单位为 token/s。Blender 为 4.5.0 Windows 的 GPU 渲染中位数。点数值查看来源。" },
  ai: { columns: ["memory", "qwen", "prefill", "llama", "power"], note: "推理单位为 token/s。生成和读入提示词分别比较，跨模型版本、引擎和卸载配置的数值仅供参照。" },
  graphics: { columns: ["fps", "blender", "sdxl", "power", "memory"], note: "游戏为 1440p 光栅和光追。Blender 为公开中位数，SDXL 为 Procyon FP16 单张时间。" },
  market: { columns: ["memory", "power", "architecture", "cn", "us", "sources"], note: "价格含渠道样本、历史优惠、批发和零售。W7900 行情用于同容量预算参照。" },
};
let view = "overview";
let page = 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function fillOptions(control, field) {
  for (const value of new Set(rows.map(record => record[field]))) {
    const option = element("option", value);
    option.value = value;
    control.append(option);
  }
}

function firstNumber(text) {
  const amount = text?.match(/^(?:(?:约|最高)\s*)?[$¥]?(\d[\d,]*(?:\.\d+)?)/);
  return amount ? Number(amount[1].replaceAll(",", "")) : null;
}

function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function memoryPerGpu(text) {
  const perGpu = text.match(/每\s*GPU\s*(\d+)/);
  if (perGpu) return Number(perGpu[1]);
  return text.includes("合计") ? null : firstNumber(text);
}

function listedPrice(record, field) {
  if (record[field].includes("预算参照")) return null;
  return firstNumber(record[field]);
}

function matches(record) {
  const searchTerms = normalize(search.value);
  const searchable = normalize([
    record.vendor, record.form, record.model, record.architecture,
    record.benchmarks.qwen ? "Qwen 千问 " + record.benchmarks.qwen.note : "",
  ].join(" "));
  const coverage = {
    qwen: Boolean(record.benchmarks.qwen),
    "measured-qwen": Boolean(record.benchmarks.qwen && !record.benchmarks.qwen.estimate),
    blender: Boolean(record.benchmarks.blender),
    prices: listedPrice(record, "cn") !== null || listedPrice(record, "us") !== null,
  };
  return searchable.includes(searchTerms)
    && (!vendor.value || vendor.value === record.vendor)
    && (!form.value || form.value === record.form)
    && (!memory.value || memoryPerGpu(record.memory) >= Number(memory.value))
    && (!evidenceFilter.value || coverage[evidenceFilter.value]);
}

function rank(a, b) {
  if (!order.value) return a.id - b.id;
  if (order.value === "memory") return (memoryPerGpu(b.memory) ?? -1) - (memoryPerGpu(a.memory) ?? -1);
  if (order.value === "qwen" || order.value === "blender") {
    return (firstNumber(b.benchmarks[order.value]?.value) ?? -1) - (firstNumber(a.benchmarks[order.value]?.value) ?? -1);
  }
  const left = listedPrice(a, order.value);
  const right = listedPrice(b, order.value);
  if (left === null && right === null) return a.id - b.id;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function toggleSelection(input, record) {
  if (input.checked && selection.size < maxSelection) selection.add(record.id);
  if (!input.checked) selection.delete(record.id);
  syncSelection();
}

function syncSelection() {
  byId("selection").hidden = selection.size === 0;
  byId("selected-label").textContent = "已选 " + selection.size + " / " + maxSelection + " 款";
  byId("compare").disabled = selection.size < 2;
  const full = selection.size >= maxSelection;
  for (const input of byId("cards").querySelectorAll("input")) {
    input.checked = selection.has(Number(input.value));
    input.disabled = full && !input.checked;
  }
}

function link(label, url) {
  const node = element("a", label);
  node.href = url;
  return node;
}

function valueCell(record, field) {
  const cell = element("td");
  const benchmark = record.benchmarks[field];
  if (benchmark) {
    const { value, note, url, estimate } = benchmark;
    cell.className = estimate ? "catalog-estimate" : "catalog-measurement";
    cell.append(url ? link(value, url) : element("span", value));
    cell.append(element("small", estimate ? "估算" : note));
    return cell;
  }
  if (field === "sources") {
    const list = element("div", undefined, "source-links");
    for (const source of record.sources) list.append(link(source.label, source.url));
    cell.append(element("small", record.evidence), list);
    return cell;
  }
  const value = record[field] ?? "—";
  const source = {
    cn: record.priceSource ?? "general.html#china-market",
    us: "general.html#us-market",
    fps: "https://www.tomshardware.com/reviews/gpu-hierarchy%2C4388.html",
  }[field];
  if (source && value !== "—") {
    const anchor = link(value, source);
    if (value.includes("预算参照")) anchor.className = "catalog-estimate";
    cell.append(anchor);
  } else {
    cell.textContent = value;
  }
  return cell;
}

function cardRow(record, columns) {
  const { vendor, form, model } = record;
  const row = element("tr");
  const selector = element("td");
  const input = element("input");
  input.type = "checkbox";
  input.value = record.id;
  input.setAttribute("aria-label", "对比 " + vendor + " " + model + " " + form);
  input.addEventListener("change", () => toggleSelection(input, record));
  selector.append(input);

  const name = element("th", undefined, "model");
  name.scope = "row";
  const modelLabel = element("button", model, "model-name");
  modelLabel.type = "button";
  modelLabel.setAttribute("aria-label", "查看 " + vendor + " " + model + " " + form + " 详情");
  modelLabel.addEventListener("click", () => showComparison([record]));
  name.append(modelLabel, element("small", vendor + " · " + form));
  if (model === "AI PRO R9700") row.className = "reference-row";
  row.append(selector, name);
  row.append(...columns.map(field => valueCell(record, field)));
  return row;
}

function render() {
  const { columns, note } = views[view];
  const headers = element("tr");
  for (const label of ["对比", "型号", ...columns.map(field => fields[field])]) {
    const th = element("th", label);
    th.scope = "col";
    headers.append(th);
  }
  byId("catalog-head").replaceChildren(headers);
  byId("catalog-note").textContent = note;
  const matchesAndSorted = rows.filter(matches).sort(rank);
  const total = matchesAndSorted.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  page = Math.min(page, pages - 1);
  const group = matchesAndSorted.slice(page * perPage, (page + 1) * perPage);
  byId("cards").replaceChildren(...group.map(record => cardRow(record, columns)));
  if (!total) {
    const row = element("tr");
    const cell = element("td", "没有匹配的型号。可清除筛选或换个搜索词。", "empty");
    cell.colSpan = columns.length + 2;
    row.append(cell);
    byId("cards").append(row);
  }
  byId("results").textContent = total + " / " + rows.length + " 条型号与版本";
  byId("page").textContent = (page + 1) + " / " + pages + " 页";
  byId("prev").disabled = page === 0;
  byId("next").disabled = page + 1 === pages;
  syncSelection();
}

function showComparison(records) {
  byId("comparison-title").textContent = records.length === 1 ? "型号详情" : "型号对比";
  const table = byId("comparison-table");
  const head = element("thead");
  const headRow = element("tr");
  headRow.append(element("th", "指标"));
  for (const { vendor, form, model } of records) {
    const th = element("th", vendor + " " + model);
    th.scope = "col";
    th.append(element("small", form));
    headRow.append(th);
  }
  head.append(headRow);
  const body = element("tbody");
  for (const [field, label] of Object.entries(fields)) {
    const row = element("tr");
    const header = element("th", label);
    header.scope = "row";
    row.append(header);
    for (const record of records) row.append(valueCell(record, field));
    body.append(row);
  }
  table.replaceChildren(head, body);
  byId("comparison").showModal();
}

fillOptions(vendor, "vendor");
fillOptions(form, "form");
for (const control of controls) {
  control.addEventListener(control === search ? "input" : "change", () => {
    page = 0;
    render();
  });
}
byId("reset").addEventListener("click", () => {
  for (const control of controls) control.value = "";
  page = 0;
  render();
});
byId("clear").addEventListener("click", () => {
  selection.clear();
  syncSelection();
});
byId("prev").addEventListener("click", () => {
  page -= 1;
  render();
});
byId("next").addEventListener("click", () => {
  page += 1;
  render();
});
byId("compare").addEventListener("click", () => showComparison(Array.from(selection, id => rows[id])));
byId("open-catalog-method").addEventListener("click", () => { byId("catalog-method").open = true; });
if (location.hash === "#catalog-method") byId("catalog-method").open = true;

const catalogViews = document.querySelectorAll("[data-catalog-view]");
function setCatalogView(nextView) {
  view = nextView;
  for (const button of catalogViews) {
    button.setAttribute("aria-pressed", String(button.dataset.catalogView === view));
  }
  page = 0;
  render();
}

for (const button of catalogViews) {
  button.addEventListener("click", () => setCatalogView(button.dataset.catalogView));
}
for (const shortcut of document.querySelectorAll("[data-catalog-shortcut]")) {
  shortcut.addEventListener("click", () => {
    const nextView = shortcut.dataset.catalogShortcut;
    evidenceFilter.value = nextView === "ai" ? "qwen" : "";
    setCatalogView(nextView);
  });
}
render();

const specialButtons = document.querySelectorAll("[data-special]");
const specialPanels = document.querySelectorAll("[data-special-panel]");
function showSpecial(selected) {
  for (const panel of specialPanels) {
    panel.hidden = panel.dataset.specialPanel !== selected;
  }
  for (const button of specialButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.special === selected));
  }
}

for (const button of specialButtons) {
  button.addEventListener("click", () => showSpecial(button.dataset.special));
}
showSpecial("r9700");
document.querySelector(".view-buttons").hidden = false;
