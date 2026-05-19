import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = "docs/diagrams";
const previewDir = join(outDir, "previews");
const elementsPath = join(outDir, "kansha-simple-architecture-elements.json");
const previewSvgPath = join(outDir, "kansha-simple-architecture-preview.svg");

mkdirSync(previewDir, { recursive: true });

const c = {
  ink: "#1e1e1e",
  muted: "#5f6368",
  softLine: "#ced4da",
  bg: "#fbfbfd",
  panel: "#ffffff",
  blue: "#a5d8ff",
  green: "#b2f2bb",
  yellow: "#ffec99",
  red: "#ffc9c9",
  purple: "#d0bfff",
  teal: "#c3fae8",
  orange: "#ffd8a8",
  pink: "#eebefa",
  slate: "#f1f3f5"
};

const elements = [{ type: "cameraUpdate", width: 1600, height: 1200, x: 0, y: 0 }];
const shapes = new Map();

function add(element) {
  elements.push(element);
  if (["rectangle", "ellipse", "diamond"].includes(element.type)) shapes.set(element.id, element);
  return element;
}

function text(id, x, y, value, fontSize = 24, color = c.ink, width = undefined) {
  add({
    type: "text",
    id,
    x,
    y,
    width,
    height: fontSize * value.split("\n").length * 1.25,
    text: value,
    fontSize,
    strokeColor: color,
    roughness: 1
  });
}

function rect(id, x, y, width, height, label, color, opts = {}) {
  add({
    type: "rectangle",
    id,
    x,
    y,
    width,
    height,
    backgroundColor: color,
    strokeColor: opts.strokeColor ?? c.ink,
    fillStyle: opts.fillStyle ?? "solid",
    strokeWidth: opts.strokeWidth ?? 2,
    strokeStyle: opts.strokeStyle,
    roughness: opts.roughness ?? 1,
    opacity: opts.opacity ?? 100,
    roundness: { type: 3 },
    label: {
      text: label,
      fontSize: opts.fontSize ?? 24,
      strokeColor: opts.labelColor ?? c.ink
    }
  });
}

function ellipse(id, x, y, width, height, label, color, opts = {}) {
  add({
    type: "ellipse",
    id,
    x,
    y,
    width,
    height,
    backgroundColor: color,
    strokeColor: opts.strokeColor ?? c.ink,
    fillStyle: opts.fillStyle ?? "solid",
    strokeWidth: opts.strokeWidth ?? 2,
    roughness: opts.roughness ?? 1,
    label: {
      text: label,
      fontSize: opts.fontSize ?? 24,
      strokeColor: opts.labelColor ?? c.ink
    }
  });
}

function side(shape, name) {
  const points = {
    left: [shape.x, shape.y + shape.height / 2, [0, 0.5]],
    right: [shape.x + shape.width, shape.y + shape.height / 2, [1, 0.5]],
    top: [shape.x + shape.width / 2, shape.y, [0.5, 0]],
    bottom: [shape.x + shape.width / 2, shape.y + shape.height, [0.5, 1]]
  };
  return points[name];
}

function arrow(id, fromId, fromSide, toId, toSide, label = "", opts = {}) {
  const from = shapes.get(fromId);
  const to = shapes.get(toId);
  const [x1, y1, fromFixed] = side(from, fromSide);
  const [x2, y2, toFixed] = side(to, toSide);
  add({
    type: "arrow",
    id,
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    points: [[0, 0], [x2 - x1, y2 - y1]],
    endArrowhead: "arrow",
    strokeColor: opts.strokeColor ?? c.ink,
    strokeWidth: opts.strokeWidth ?? 3,
    strokeStyle: opts.strokeStyle,
    roughness: 1,
    startBinding: { elementId: fromId, fixedPoint: fromFixed },
    endBinding: { elementId: toId, fixedPoint: toFixed },
    label: label
      ? {
          text: label,
          fontSize: opts.fontSize ?? 18,
          strokeColor: opts.labelColor ?? c.muted
        }
      : undefined
  });
}

function bigCard(id, x, y, title, body, color) {
  rect(id, x, y, 360, 170, `${title}\n${body}`, color, {
    fillStyle: "hachure",
    fontSize: 22
  });
}

add({
  type: "rectangle",
  id: "canvas_bg",
  x: 20,
  y: 20,
  width: 2350,
  height: 1420,
  backgroundColor: c.bg,
  strokeColor: "transparent",
  strokeWidth: 0,
  fillStyle: "solid",
  roughness: 1,
  roundness: { type: 3 }
});

text("title", 90, 70, "Kansha Care Earthquake Monitor", 48, c.ink);
text(
  "subtitle",
  92,
  132,
  "A simple real-time monitoring system: ingest earthquake telemetry, store operational truth, show risk, and alert verified users.",
  24,
  c.muted
);

add({
  type: "arrow",
  id: "title_divider",
  x: 90,
  y: 190,
  width: 2190,
  height: 0,
  points: [[0, 0], [2190, 0]],
  endArrowhead: null,
  strokeColor: c.softLine,
  strokeWidth: 2,
  roughness: 1
});

// Main actors.
ellipse("usgs", 100, 495, 270, 155, "USGS Feeds\nall_month\nall_hour", c.blue, { fontSize: 23 });
rect("worker", 500, 425, 400, 250, "Worker\nBullMQ jobs\n\nBackfill\nLive polling\nAlert rules", c.green, {
  fillStyle: "hachure",
  fontSize: 25
});
rect("postgres", 1040, 430, 365, 215, "Postgres\nDrizzle schema\n\nEvents, users\nLocations, alerts\nHealth", c.teal, { fontSize: 24 });
rect("api", 1040, 745, 365, 180, "Hono API\nJWT + Zod\n\nDashboard data\nLocation setup\nAgent routes", c.purple, {
  fillStyle: "hachure",
  fontSize: 23
});
rect("web", 1570, 575, 370, 185, "React Dashboard\nVite + Leaflet\n\nGlobal view\nLocation risk\nSystem health", c.blue, {
  fillStyle: "hachure",
  fontSize: 23
});
ellipse("telegram", 525, 230, 350, 155, "Telegram Bot\n\nVerified alerts\nDaily summaries", c.orange, { fontSize: 24 });
rect("assistant", 1570, 860, 370, 150, "Kansha Assistant\n\nAnswers questions\nChanges need approval", c.pink, {
  fillStyle: "hachure",
  fontSize: 23
});
rect("redis", 555, 785, 290, 120, "Redis\nJob queue\nrepeat schedules", c.purple, { fontSize: 24 });
rect("external", 2040, 700, 260, 145, "External APIs\n\nGeocoding\nOpenAI", c.yellow, { fontSize: 24 });

// Main flows.
arrow("a_usgs_worker", "usgs", "right", "worker", "left");
arrow("a_worker_pg", "worker", "right", "postgres", "left");
arrow("a_worker_redis", "worker", "bottom", "redis", "top");
arrow("a_worker_tg", "worker", "top", "telegram", "bottom");
arrow("a_api_pg", "api", "top", "postgres", "bottom");
arrow("a_web_api", "web", "left", "api", "right");
arrow("a_assistant_api", "assistant", "top", "api", "bottom");
arrow("a_api_external", "api", "right", "external", "left");

// Brief strip.
add({
  type: "rectangle",
  id: "brief_panel",
  x: 90,
  y: 1045,
  width: 2190,
  height: 300,
  backgroundColor: c.panel,
  strokeColor: c.softLine,
  strokeWidth: 2,
  fillStyle: "solid",
  roughness: 1,
  roundness: { type: 3 }
});
text("brief_title", 125, 1084, "What the project is doing", 32, c.ink);
text("brief_subtitle", 126, 1128, "The earthquake feed mirrors elder-care sensors: mostly routine signals, occasional urgent events, and a need for reliable operational visibility.", 20, c.muted);

bigCard("brief_ingest", 135, 1185, "Ingest", "Backfill 30 days\nPoll live every 60s", c.blue);
bigCard("brief_monitor", 610, 1185, "Monitor", "Global incidents\nPer-location risk", c.green);
bigCard("brief_alert", 1085, 1185, "Alert", "M5 global, M4 local\nSwarm and silence", c.red);
bigCard("brief_operate", 1560, 1185, "Operate", "Dashboard, admin\nTelegram assistant", c.pink);

writeFileSync(elementsPath, `${JSON.stringify(elements, null, 2)}\n`);
writeFileSync(previewSvgPath, buildSvg());

console.log(`Wrote ${elementsPath}`);
console.log(`Wrote ${previewSvgPath}`);

function buildSvg() {
  const width = 2400;
  const height = 1480;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
  <defs>
    <marker id="arrowhead" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto">
      <polygon points="0 0, 12 4, 0 8" fill="${c.ink}"/>
    </marker>
    <style>
      text { font-family: Inter, Arial, sans-serif; fill: ${c.ink}; }
      .muted { fill: ${c.muted}; }
    </style>
  </defs>
  ${elements.filter((element) => element.type !== "cameraUpdate").map(svgElement).join("\n")}
</svg>
`;
}

function svgElement(element) {
  if (element.type === "text") return svgText(element.x, element.y + element.fontSize, element.text, element.fontSize, element.strokeColor, "start", false);
  if (element.type === "arrow") {
    const end = element.points.at(-1);
    const x2 = element.x + end[0];
    const y2 = element.y + end[1];
    const label = element.label?.text
      ? svgText((element.x + x2) / 2, (element.y + y2) / 2 - 12, element.label.text, element.label.fontSize ?? 18, element.label.strokeColor ?? c.muted, "middle", false)
      : "";
    const marker = element.endArrowhead === null ? "" : 'marker-end="url(#arrowhead)"';
    return `<line x1="${element.x}" y1="${element.y}" x2="${x2}" y2="${y2}" stroke="${element.strokeColor ?? c.ink}" stroke-width="${element.strokeWidth ?? 3}" ${marker}/>${label}`;
  }

  const fill = element.backgroundColor === "transparent" ? "none" : element.backgroundColor;
  const stroke = element.strokeColor === "transparent" ? "none" : element.strokeColor;
  const opacity = element.opacity === undefined ? 1 : element.opacity / 100;
  const shape =
    element.type === "ellipse"
      ? `<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${element.strokeWidth ?? 2}" opacity="${opacity}"/>`
      : `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="26" fill="${fill}" stroke="${stroke}" stroke-width="${element.strokeWidth ?? 2}" opacity="${opacity}"/>`;
  const label = element.label?.text
    ? svgText(
        element.x + element.width / 2,
        element.y + element.height / 2 - ((element.label.text.split("\n").length - 1) * (element.label.fontSize ?? 24) * 0.6),
        element.label.text,
        element.label.fontSize ?? 24,
        element.label.strokeColor ?? c.ink,
        "middle",
        true
      )
    : "";
  return `${shape}${label}`;
}

function svgText(x, y, value, fontSize, color, anchor = "start", bold = false) {
  const lines = value.split("\n");
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * fontSize * 1.25}" font-size="${fontSize}" font-weight="${bold ? 700 : 500}" fill="${color}" text-anchor="${anchor}">${escapeXml(line)}</text>`
    )
    .join("");
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
