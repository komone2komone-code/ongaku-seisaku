window.DTM = window.DTM || {};

DTM.imageBase = "";

DTM.homeCategories = [
  { id: "dict", title: "DTM辞典", hash: "#/dict", blurb: "用語・メーカー・製品をすぐ調べる" },
  { id: "env", title: "我が家のDTM環境", hash: "#/env", blurb: "いま使っている機材・ソフト・接続を確認" },
  { id: "buy", title: "購入検討", hash: "#/buy", blurb: "気になる機材を比較・記録" },
  { id: "diy", title: "手作り・自作", hash: "#/diy", blurb: "機材・楽器・ソフトを自分で作る" }
];

DTM.categories = [
  { id: "owned-gear", title: "持っている機材", hash: "#/gear", blurb: "我が家にある機材を確認" },
  { id: "computers", title: "パソコン・Apple製品", hash: "#/computers", blurb: "PC・Mac・iPad・スマホを確認" },
  { id: "software", title: "DAW・ソフト", hash: "#/software", blurb: "Cubase・Logic・プラグインなど" },
  { id: "instruments", title: "ソフト音源", hash: "#/instruments", blurb: "音源・Kontakt・サンプル系を確認" },
  { id: "glossary", title: "DTM用語集", hash: "#/terms", blurb: "分からないDTM用語をすぐ確認" },
  { id: "brands", title: "メーカー・ブランド", hash: "#/brands", blurb: "メーカーの国・特徴・得意分野を見る" },
  { id: "howto", title: "実機の使い方", hash: "#/howto", blurb: "機材の使い方や動画を見る" },
  { id: "purchase", title: "購入検討", hash: "#/purchase", blurb: "気になる機材を比較・記録" },
  { id: "diy", title: "手作り機材・楽器・ソフト", hash: "#/diy", blurb: "自作DTM機材やソフトのアイデア" },
  { id: "apple-dtm", title: "Apple DTM連携", hash: "#/apple", blurb: "Apple製品を連携した制作方法" },
  { id: "patch", title: "機材接続図", hash: "#/patch", blurb: "何と何をつなぐか図で確認" }
];

DTM.statusLabels = {
  owned: "持っている",
  builtin: "機能が内蔵",
  planned: "購入検討中",
  considering: "購入検討中",
  "not-owned": "持っていない",
  unknown: "未確認"
};

DTM.instrumentCategories = [
  { id: "piano", title: "ピアノ／鍵盤" },
  { id: "strings", title: "ストリングス" },
  { id: "drums", title: "ドラム／パーカッション" },
  { id: "synth", title: "シンセ" },
  { id: "vocal", title: "ボーカル" },
  { id: "orchestra", title: "オーケストラ" },
  { id: "wagakki", title: "和楽器" },
  { id: "other", title: "その他" }
];

DTM.termKinds = [
  { id: "gear", label: "機材" },
  { id: "function", label: "機能" },
  { id: "standard", label: "規格" },
  { id: "concept", label: "仕組み・考え方" },
  { id: "brand", label: "メーカー／ブランド" },
  { id: "product", label: "具体的な製品" },
  { id: "category", label: "機材の種類" }
];

DTM.videoCategories = [
  "最初に見る",
  "基本操作",
  "サンプリング",
  "接続方法",
  "Cubaseとの連携",
  "Logicとの連携",
  "応用"
];

DTM.gearGroups = [
  { id: "play", title: "演奏・入力系" },
  { id: "record", title: "レコード" },
  { id: "looper", title: "ルーパー" },
  { id: "guitar", title: "ギター系" },
  { id: "mic", title: "マイク" },
  { id: "headphones", title: "ヘッドホン" },
  { id: "interface", title: "オーディオインターフェース" },
  { id: "monitor", title: "モニタースピーカー" },
  { id: "dj", title: "DJ機材" },
  { id: "assist", title: "制作補助デバイス" },
  { id: "mixer", title: "ミキサー" },
  { id: "mic-pre", title: "マイクプリ" },
  { id: "channel-strip", title: "チャンネルストリップ" },
  { id: "vocal", title: "ボーカル処理" },
  { id: "acoustic", title: "吸音・音響対策" },
  { id: "handheld", title: "ハンディレコーダー" },
  { id: "monitor-control", title: "モニターコントローラー" },
  { id: "sync", title: "同期・クロック" },
  { id: "camera", title: "カメラ" },
  { id: "other", title: "その他" }
];
