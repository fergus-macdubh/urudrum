/**
 * Dev-only screenshot sink.
 *
 * The Phaser canvas can be captured in-page, but getting the pixels out to disk otherwise
 * means round-tripping a base64 blob through the console. This accepts a POSTed data URL and
 * writes it to tools/shots/, so `grabToDisk()` in the browser produces a real PNG we can open.
 *
 *   node tools/snapsink.mjs
 */
import { createServer } from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
mkdirSync(OUT, { recursive: true });

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method !== "POST") return res.writeHead(405).end();

  const name = (new URL(req.url, "http://x").searchParams.get("name") || "shot") + ".png";
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const base64 = body.includes(",") ? body.slice(body.indexOf(",") + 1) : body;
    const file = join(OUT, name);
    writeFileSync(file, Buffer.from(base64, "base64"));
    console.log(`wrote ${file} (${Math.round(base64.length / 1024)} KB b64)`);
    res.writeHead(200).end("ok");
  });
}).listen(5199, () => console.log("snapsink listening on http://localhost:5199"));
