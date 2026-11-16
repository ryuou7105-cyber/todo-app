// =====================================================
//  ガソリンの全国平均を取ってきて、text/gas.txt の「ガソリン」の部分だけ書きかえる
//  ・「高速代」から下は、手で入れたデータなので、そのまま残す
//  ・うまく取れなかったときは、ファイルをさわらずに止まる(こわれた数字を入れない)
//  動かし方:リポジトリのいちばん上のフォルダで  node scripts/update-gas.mjs
// =====================================================

import { readFile, writeFile } from "node:fs/promises";

const SRC  = "https://pps-net.org/oilstand"; // 出典:資源エネルギー庁の週次調査をまとめているページ
const FILE = "text/gas.txt";                 // わりかんアプリが読み込むファイル

const FUELS = ["レギュラー", "ハイオク", "軽油"];

// ページの文章から、3つの値段を取り出す
export function pickPrices(html) {
  const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " "); // タグを落として文章にする
  // それぞれの燃料について、名前のすぐ後ろにある「169.9 円」のような数字を、候補として全部集める
  const found = {};
  for (const label of FUELS) {
    const re = new RegExp(label + "[^0-9]{0,40}?(\\d{2,3}\\.\\d)\\s*円", "g");
    found[label] = [...text.matchAll(re)].map((m) => Math.round(parseFloat(m[1])))
      .filter((v) => v >= 100 && v <= 300) // 出荷前の検査:ありえない数字ははじく
      .slice(0, 5);
    if (found[label].length === 0) throw new Error(label + " の価格が見つからない(ページの作りが変わったかも)");
  }
  // 候補の中から「ハイオク > レギュラー > 軽油」で、差も常識的な組み合わせを選ぶ
  // (見出しの文字などから、ちがう数字を拾ってしまうのを防ぐ)
  let prices = null;
  for (const r of found["レギュラー"]) for (const h of found["ハイオク"]) for (const k of found["軽油"]) {
    if (!prices && h > r && r > k && h - r <= 25 && r - k <= 45) {
      prices = { "レギュラー": r, "ハイオク": h, "軽油": k };
    }
  }
  if (!prices) throw new Error("価格の組み合わせがおかしい: " + JSON.stringify(found));
  // 調査日(「～2026/11/9」のような書き方)が見つかれば、それも取る
  const d = text.match(/[～〜~]\s*(20\d\d)\/(\d{1,2})\/(\d{1,2})/);
  const date = d ? d[1] + "-" + d[2].padStart(2, "0") + "-" + d[3].padStart(2, "0") : "";
  return { prices, date };
}

// 今のファイルの中身に、新しい値段をはめこむ
export function merge(raw, prices, date) {
  const cut = raw.indexOf("高速代");
  const tollSection = cut >= 0 ? raw.slice(cut).trimEnd() + "\n" : "";
  const lines = ["ガソリン"];
  if (date) lines.push("調査日　" + date);
  for (const label of FUELS) lines.push(label + "　" + prices[label]);
  return lines.join("\n") + "\n" + tollSection;
}

// このファイルを直接動かしたときだけ、実際に取りに行く(検査のときは動かさない)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const res = await fetch(SRC, { headers: { "User-Agent": "Mozilla/5.0 (gas-update)" } });
  if (!res.ok) throw new Error("取得失敗 HTTP " + res.status);
  const { prices, date } = pickPrices(await res.text());
  console.log("取得:", JSON.stringify(prices), "調査日:", date || "不明");

  const current = await readFile(FILE, "utf8");
  // 調査日が読めなかったときは、今日(日本時間)を「確認日」として書く
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const next = date ? merge(current, prices, date)
                    : merge(current, prices, "").replace("ガソリン\n", "ガソリン\n確認日　" + today + "\n");

  if (next.trim() === current.trim()) {
    console.log("変更なし → 何もしません");
  } else {
    await writeFile(FILE, next);
    console.log("更新しました");
  }
}
