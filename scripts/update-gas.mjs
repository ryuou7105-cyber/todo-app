// 資源エネルギー庁の全国平均を取り、text/gas.txt の「ガソリン」行だけ書き換える。
// 「高速代」はユーザーが手で入れたデータなので、そのまま残す。

import { readFile, writeFile } from "node:fs/promises";

const SRC  = "https://pps-net.org/oilstand"; // 出典:資源エネルギー庁・週次
const FILE = "text/gas.txt";

const FUELS = [["レギュラー", "regular"], ["ハイオク", "premium"], ["軽油", "diesel"]];

async function fetchPrices() {
  const res = await fetch(SRC);
  if (!res.ok) throw new Error("取得失敗 HTTP " + res.status);
  const text = (await res.text()).replace(/<[^>]*>/g, " "); // タグを落として文章にする

  const prices = {};
  for (const [label] of FUELS) {
    // 「レギュラー」の直近にある「169.9 円」のような数字を探す
    const m = text.match(new RegExp(label + "[^0-9]{0,20}?(\\d{2,3}\\.\\d)\\s*円"));
    if (!m) throw new Error(label + " の価格が見つからない");
    const v = Math.round(parseFloat(m[1]));
    // 異常値（ページの別要素を拾った等）を弾く。壊れたデータでアプリを汚さない
    if (v < 100 || v > 300) throw new Error(label + " の価格が異常: " + v);
    prices[label] = v;
  }
  return prices;
}

function merge(raw, prices) {
  const cut = raw.indexOf("高速代");
  const tollSection = cut >= 0 ? "\n" + raw.slice(cut) : "\n";
  const lines = ["ガソリン"];
  for (const [label] of FUELS) lines.push(label + "　" + prices[label]); // 区切りは元と同じ全角スペース
  return lines.join("\n") + tollSection;
}

const prices  = await fetchPrices();
const current = await readFile(FILE, "utf8");
const next    = merge(current, prices);

console.log("取得:", JSON.stringify(prices));

if (next.trim() === current.trim()) {
  console.log("変更なし → コミットしません");   // 冪等性：無駄なコミットを作らない
} else {
  await writeFile(FILE, next);
  console.log("更新しました");
}
