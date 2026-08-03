// Serves images uploaded via POST /api/submissions (see api.mjs's saveImage),
// which are stored in Netlify Blobs rather than on local disk — a function
// has no persistent filesystem to write img/submissions/ into the way
// museum_server.py's _save_image() did.
import { getStore } from "@netlify/blobs";

const CONTENT_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export default async (req) => {
  const url = new URL(req.url);
  const filename = url.pathname.replace(/^\/img\/submissions\//, "");
  if (!filename || filename.includes("/")) {
    return new Response("not found", { status: 404 });
  }
  const store = getStore("submission-images");
  const data = await store.get(filename, { type: "arrayBuffer" });
  if (!data) return new Response("not found", { status: 404 });
  const ext = filename.split(".").pop();
  return new Response(data, {
    status: 200,
    headers: {
      "content-type": CONTENT_TYPES[ext] || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};

export const config = { path: "/img/submissions/*" };
