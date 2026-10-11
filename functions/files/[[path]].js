// ---------------------------------------------------------------
// SERVER CODE: send a video from Cloudflare R2 to the browser
//
// Runs for every address that starts with /files/
// For example: /files/<user id>/<random name>.mp4
//
// A video player does not ask for the whole file. It asks for small
// parts: "give me bytes 1000000 to 2000000". That is a RANGE
// request, and it is what makes jumping around in a movie work.
//
// Movies are for subscribers only. So every address must carry a
// signature from /api/play. See functions/_signing.js.
// ---------------------------------------------------------------

import { isValid } from "../_signing.js";

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Only reading is allowed here.", { status: 405 });
  }
  if (!env.MOVIES) {
    return new Response("The MOVIES bucket is not linked.", { status: 500 });
  }

  if (!env.SIGNING_SECRET) {
    return new Response("The SIGNING_SECRET is missing.", { status: 500 });
  }

  const key = (context.params.path || []).join("/");

  // Check the signature before touching the bucket.
  const url = new URL(request.url);
  const allowed = await isValid(
    env.SIGNING_SECRET,
    key,
    url.searchParams.get("expires"),
    url.searchParams.get("signature")
  );

  if (!allowed) {
    return new Response("This link has expired. Open the movie again.", { status: 403 });
  }

  // Passing the request headers lets R2 read the "Range" header
  // itself, and also "If-None-Match" (the browser saying "I already
  // have this file, did it change?").
  let object;
  try {
    object = await env.MOVIES.get(key, {
      range: request.headers,
      onlyIf: request.headers,
    });
  } catch (error) {
    // R2 refuses a range that is outside the file.
    return new Response("That part of the file does not exist.", { status: 416 });
  }

  if (!object) {
    return new Response("File not found.", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers); // sets Content-Type: video/mp4
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  // "private" means: only this person's browser may keep a copy,
  // not shared caches in between.
  headers.set("Cache-Control", "private, max-age=3600");

  // No body means the browser already has this file (status 304).
  if (!object.body) {
    return new Response(null, { status: 304, headers: headers });
  }

  // Work out which bytes we are sending.
  let offset = 0;
  let length = object.size;

  if (object.range) {
    if (object.range.suffix !== undefined) {
      // "the last N bytes"
      length = Math.min(object.range.suffix, object.size);
      offset = object.size - length;
    } else {
      offset = object.range.offset || 0;
      length = object.range.length !== undefined ? object.range.length : object.size - offset;
    }
  }

  if (offset >= object.size) {
    return new Response("That part of the file does not exist.", { status: 416 });
  }

  headers.set("Content-Length", String(length));

  const isPartial = request.headers.has("Range");
  if (isPartial) {
    headers.set("Content-Range", "bytes " + offset + "-" + (offset + length - 1) + "/" + object.size);
  }

  return new Response(request.method === "HEAD" ? null : object.body, {
    // 206 means "here is the part you asked for". 200 is the whole file.
    status: isPartial ? 206 : 200,
    headers: headers,
  });
}
