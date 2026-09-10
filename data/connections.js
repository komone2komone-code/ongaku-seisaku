window.DTM = window.DTM || {};

DTM.signalKinds = [
  { id: "audio", label: "AUDIO" },
  { id: "midi", label: "MIDI" }
];

DTM.connections = [
  {
    id: "mac-setup",
    title: "Mac制作環境",
    name: "Mac制作環境",
    nodes: [
      { id: "n-a49", itemType: "gear", itemId: "roland-a49", x: 16, y: 36 },
      { id: "n-mv7", itemType: "gear", itemId: "shure-mv7", x: 184, y: 36 },
      { id: "n-mpc", itemType: "gear", itemId: "akai-mpc-studio", x: 16, y: 244 },
      { id: "n-m2", itemType: "gear", itemId: "motu-m2", x: 184, y: 244 },
      { id: "n-mac", itemType: "computers", itemId: "macbook-yuri", x: 392, y: 124 },
      { id: "n-hs5", itemType: "gear", itemId: "yamaha-hs5", x: 592, y: 124 }
    ],
    edges: [
      { id: "e-a49-mac", from: "n-a49", to: "n-mac", kind: "midi", direction: "forward", label: "USB", unconfirmed: true },
      { id: "e-mv7-m2", from: "n-mv7", to: "n-m2", kind: "audio", direction: "forward", label: "MIC IN", unconfirmed: true },
      { id: "e-m2-mac", from: "n-m2", to: "n-mac", kind: "audio", direction: "forward", label: "USB", unconfirmed: true },
      { id: "e-m2-hs5", from: "n-m2", to: "n-hs5", kind: "audio", direction: "forward", label: "LINE OUT", unconfirmed: true },
      { id: "e-mpc-mac", from: "n-mpc", to: "n-mac", kind: "midi", direction: "forward", label: "USB", unconfirmed: true }
    ]
  }
];
