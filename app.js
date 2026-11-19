"use strict";

const byId = (id) => document.getElementById(id);
const controls = ["search", "vendor", "form", "memory", "order"].map(byId);
const [search, vendor, form, memory, order] = controls;
const rows = JSON.parse(byId("catalog-data").textContent).map((cells, id) => ({ cells, id }));
const selection = new Set();
const perPage = 12;
const maxSelection = 3;
let page = 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function fillOptions(control, column) {
  for (const value of new Set(rows.map(({ cells }) => cells[column]))) {
    const option = element("option", value);
    option.value = value;
    control.append(option);
  }
}

function firstNumber(text) {
  const amount = text.match(/^(?:约\s*)?[$¥]?(\d[\d,]*(?:\.\d+)?)/);
  return amount ? Number(amount[1].replaceAll(",", "")) : null;
}

function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function matches({ cells }) {
  const searchTerms = normalize(search.value);
  const searchable = normalize([cells[0], cells[1], cells[2]].join(" "));
  return searchable.includes(searchTerms)
    && (!vendor.value || vendor.value === cells[0])
    && (!form.value || form.value === cells[1])
    && (!memory.value || firstNumber(cells[3]) >= Number(memory.value));
}

function rank(a, b) {
  if (!order.value) return a.id - b.id;
  if (order.value === "memory") {
    return (firstNumber(b.cells[3]) ?? -1) - (firstNumber(a.cells[3]) ?? -1);
  }
  const column = order.value === "cn" ? 8 : 9;
  const left = firstNumber(a.cells[column]);
  const right = firstNumber(b.cells[column]);
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

function cardRow(record) {
  const [brand, shape, model, vram, power, , , , cn, us] = record.cells;
  const row = element("tr");
  const selector = element("td");
  const input = element("input");
  input.type = "checkbox";
  input.value = record.id;
  input.setAttribute("aria-label", "对比 " + brand + " " + model + " " + shape);
  input.addEventListener("change", () => toggleSelection(input, record));
  selector.append(input);

  const name = element("th", undefined, "model");
  name.scope = "row";
  name.append(element("strong", model));
  name.append(element("small", brand + " · " + shape));
  if (model === "AI PRO R9700") row.className = "reference-row";
  row.append(selector, name);
  for (const value of [vram, power === "—" ? "—" : power + " W", cn, us]) {
    row.append(element("td", value));
  }
  return row;
}

function render() {
  const matchesAndSorted = rows.filter(matches).sort(rank);
  const total = matchesAndSorted.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  page = Math.min(page, pages - 1);
  const group = matchesAndSorted.slice(page * perPage, (page + 1) * perPage);
  byId("cards").replaceChildren(...group.map(cardRow));
  if (!total) {
    const row = element("tr");
    const cell = element("td", "没有匹配的型号。可清除筛选或换个搜索词。", "empty");
    cell.colSpan = 6;
    row.append(cell);
    byId("cards").append(row);
  }
  byId("results").textContent = total + " / " + rows.length + " 条型号与版本";
  byId("page").textContent = (page + 1) + " / " + pages + " 页";
  byId("prev").disabled = page === 0;
  byId("next").disabled = page + 1 === pages;
  syncSelection();
}

function compare() {
  const records = Array.from(selection, (id) => rows[id]);
  const table = byId("comparison-table");
  const head = element("thead");
  const headRow = element("tr");
  headRow.append(element("th", "指标"));
  for (const { cells } of records) {
    const th = element("th", cells[0] + " " + cells[2]);
    th.scope = "col";
    headRow.append(th);
  }
  head.append(headRow);
  const body = element("tbody");
  const fields = [[1, "形态"], [3, "显存"], [4, "功耗（W）"], [5, "架构 / 带宽"], [6, "1440p 光栅 / 光追 FPS"], [7, "专项性能"], [8, "大陆价（元）"], [9, "美国价（美元）"]];
  for (const [index, label] of fields) {
    const row = element("tr");
    const header = element("th", label);
    header.scope = "row";
    row.append(header);
    for (const { cells } of records) row.append(element("td", cells[index]));
    body.append(row);
  }
  table.replaceChildren(head, body);
  byId("comparison").showModal();
}

fillOptions(vendor, 0);
fillOptions(form, 1);
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
byId("compare").addEventListener("click", compare);
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
