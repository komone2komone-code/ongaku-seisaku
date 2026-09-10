window.DTM = window.DTM || {};

DTM.diyStatuses = [
  { id: "wishlist", title: "作ってみたい" },
  { id: "making", title: "制作中" },
  { id: "done", title: "完成したもの" }
];

DTM.diyKinds = [
  { id: "midi-controller", title: "MIDIコントローラー", termId: "midi-controller" },
  { id: "sampler", title: "サンプラー", termId: "sampler" },
  { id: "sequencer", title: "シーケンサー", termId: "sequencer" },
  { id: "instrument", title: "電子楽器", termId: "" },
  { id: "footswitch", title: "MIDIフットスイッチ", termId: "" },
  { id: "piezo", title: "コンタクトマイク／ピエゾを使った楽器", termId: "" },
  { id: "synth", title: "簡単なシンセサイザー", termId: "synthesizer" },
  { id: "software", title: "音楽制作ソフト", termId: "" },
  { id: "plugin", title: "プラグイン", termId: "" },
  { id: "other", title: "その他", termId: "" }
];

DTM.diyPower = [
  { id: "low", title: "USB／電池／低電圧" },
  { id: "unknown", title: "未確認" },
  { id: "mains", title: "家庭用100Vを直接扱う" }
];

DTM.diyLevels = [
  { id: "", title: "未設定" },
  { id: "beginner", title: "初級" },
  { id: "intermediate", title: "中級" },
  { id: "advanced", title: "上級" }
];

DTM.diy = [
  {
    id: "diy-foot-dtm-controller",
    name: "足で操作するDTMコントローラー"
  },
  {
    id: "diy-looper-battle",
    name: "ルーパー対決",
    memo: "企画アイデア。持ち込み楽器3つまで。5分間でルーパーに音を構築し、その後3分間の本演奏。完成度・構成・演奏・アイデアで競うコンテスト案。"
  }
];
