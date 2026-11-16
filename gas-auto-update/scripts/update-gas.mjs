import { readFile, writeFile } from "node:fs/promises";

const SRC = "https://pps-net.org/oilstand";
const FILE = "gas-auto-update/text/gas.txt";

const FUELS = [["レギュラー", "regular"], ["ハイオク", "premium"], ["軽油", "diesel"]];

async function fetchPrices() {
  const res = await fetch(SRC);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const text = (await res.text()).replace(/<[^>]*>/g, " ");

  const prices = {};
  for (const [label] of FUELS) {
    const m = text.match(new RegExp(label + "[^0-9]{0,20}?(\\d{2,3}\\.\\d)\\s*円"));
    if (!m) throw new Error(label + " not found");
    const v = Math.round(parseFloat(m[1]));
    if (v < 100 || v > 300) throw new Error(label + ": " + v);
    prices[label] = v;
  }
  return prices;
}

function merge(raw, prices) {
  const cut = raw.indexOf("高速代");
  const tollSection = cut >= 0 ? "\n" + raw.slice(cut) : "\n";
  const lines = ["ガソリン"];
  for (const [label] of FUELS) lines.push(label + " " + prices[label]);
  return lines.join("\n") + tollSection;
}

const prices = await fetchPrices();
const current = await readFile(FILE, "utf8");
const next = merge(current, prices);

console.log("取得:", JSON.stringify(prices));

if (next.trim() === current.trim()) {
  console.log("No changes");
} else {
  await writeFile(FILE, next);
  console.log("Updated");
}
