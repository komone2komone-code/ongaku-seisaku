window.DTM = window.DTM || {};

DTM.workflows = [
  {
    id: "wf-idea-outside",
    title: "外出先でメロディを思いついた",
    summary: "外出先でアイデアを残し、家で本制作する流れ",
    steps: [
      { deviceId: "iphone-yuri", action: "鼻歌、歌詞、思いついたメロディを記録する" },
      { deviceId: "ipad-air-yuri", action: "アイデアを曲の形に整える" },
      { deviceId: "macbook-yuri", action: "Logic などで本制作、編集、MIX する" }
    ]
  },
  {
    id: "wf-field-recording",
    title: "旅先で環境音を録音した",
    summary: "その場の音を持ち帰って、曲や映像に使う流れ",
    steps: [
      { deviceId: "iphone-yuri", action: "環境音やその場の雰囲気を録音する" },
      { deviceId: "ipad-air-yuri", action: "気に入った部分を切り出してアイデアにする" },
      { deviceId: "macbook-yuri", action: "Logic に取り込み、曲や映像用の音として整える" }
    ]
  },
  {
    id: "wf-ipad-beat",
    title: "iPadでビートを作った",
    summary: "タブレットでリズムを作り、Mac で本制作へ渡す流れ",
    steps: [
      { deviceId: "ipad-air-yuri", action: "ビートやループの骨格を作る" },
      { deviceId: "macbook-yuri", action: "Logic に渡して本制作、編集、MIX する" }
    ]
  },
  {
    id: "wf-home-production",
    title: "家に帰ってMacで本制作",
    summary: "外で残した素材を、家の Mac で本制作する流れ",
    steps: [
      { deviceId: "iphone-yuri", action: "外出先で残した録音やメモを確認する" },
      { deviceId: "ipad-air-yuri", action: "必要なら曲の形まで整えておく" },
      { deviceId: "macbook-yuri", action: "Logic で本制作する" }
    ]
  },
  {
    id: "wf-vocal-mix",
    title: "歌を録音してMIX",
    summary: "録音から MIX までを家の制作環境で進める流れ",
    steps: [
      { deviceId: "macbook-yuri", action: "Logic で歌を録音し、編集と MIX を進める" }
    ]
  }
];
