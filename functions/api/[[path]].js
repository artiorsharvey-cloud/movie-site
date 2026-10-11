// ---------------------------------------------------------------
// SERVER CODE: big video uploads to Cloudflare R2
//
// This file does NOT run in the browser. It runs on Cloudflare's
// computers. The file name [[path]].js means: run this code for
// every address that starts with /api/
//
// A 4 GB file is too big to send in one go. So the browser cuts it
// into small pieces and sends them one by one. R2 glues the pieces
// together at the end. This is called a MULTIPART UPLOAD:
//
//   POST   /api/upload/start     "I want to upload a video"
//   PUT    /api/upload/part      one piece of the file (many times)
//   POST   /api/upload/complete  "that was the last piece, glue them"
//   POST   /api/upload/abort     "something broke, throw it away"
//   DELETE /api/file             delete a finished video
//
// env.MOVIES is the R2 bucket. Cloudflare gives it to this code
// because of the "binding" you add in the dashboard. No keys needed.
// ---------------------------------------------------------------

// The same Supabase project as the website. This key is the public
// one, so it is fine to have it here.
const SUPABASE_URL = "https://xmkjrncoexgjcyjcaukf.supabase.co";
const SUPABASE_KEY = "sb_publishable_zy4lZL5239LLuA5Cbz1Gew_FNkccaUz";

const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const PART_BYTES = 20 * 1024 * 1024; // each piece is 20 MB
const VIDEO_TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

// An error that also knows which status number to answer with.
// 400 = bad request, 401 = not logged in, 403 = not allowed.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status) {
  return Response.json(data, { status: status || 200 });
}

// ---------------------------------------------------------------
// WHO IS ASKING?
// The browser sends the login token. We do not trust it blindly:
// we ask Supabase "is this token real, and whose is it?"
// Then we check the email against the list of allowed uploaders.
// Without that list, any stranger could sign up and fill the
// bucket with files that YOU pay for.
// ---------------------------------------------------------------
async function getUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "Please log in.");
  }

  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_KEY, Authorization: authorization },
  });

  if (!response.ok) {
    throw new HttpError(401, "Your login has expired. Please log in again.");
  }

  const user = await response.json();

  // ALLOWED_EMAILS is an ENVIRONMENT VARIABLE: a setting you type in
  // the Cloudflare dashboard, not in the code. Example value:
  //   me@example.com, friend@example.com
  const allowedEmails = (env.ALLOWED_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map(function (email) {
      return email.trim();
    })
    .filter(Boolean);

  if (allowedEmails.length === 0) {
    throw new HttpError(500, "Uploads are not set up: the ALLOWED_EMAILS variable is missing.");
  }
  if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
    throw new HttpError(403, "This account is not allowed to upload.");
  }

  return user;
}

// Every file lives in a folder named after its owner's id.
// So this check means: you may only touch your own files.
function checkOwnKey(user, key) {
  if (typeof key !== "string" || !key.startsWith(user.id + "/")) {
    throw new HttpError(403, "That file is not yours.");
  }
}

// ---------------------------------------------------------------
// THE ROUTES
// ---------------------------------------------------------------
async function startUpload(request, env, user) {
  const body = await request.json();
  const extension = VIDEO_TYPES[body.contentType];

  if (!extension) {
    throw new HttpError(400, "The video must be an MP4 or WebM file.");
  }
  if (!Number.isInteger(body.size) || body.size < 1 || body.size > MAX_VIDEO_BYTES) {
    throw new HttpError(400, "The video must be 5 GB or smaller.");
  }

  // The path is: my user id / a random name . the file type
  const key = user.id + "/" + crypto.randomUUID() + "." + extension;

  const upload = await env.MOVIES.createMultipartUpload(key, {
    httpMetadata: { contentType: body.contentType },
  });

  return json({ key: key, uploadId: upload.uploadId, partSize: PART_BYTES });
}

async function uploadPart(request, env, user) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const uploadId = url.searchParams.get("uploadId");
  const partNumber = Number(url.searchParams.get("partNumber"));

  checkOwnKey(user, key);

  if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    throw new HttpError(400, "Bad piece number.");
  }
  if (!request.body) {
    throw new HttpError(400, "The piece is empty.");
  }

  // request.body is a STREAM: the bytes flow from the browser
  // straight into R2, without filling this server's memory.
  const upload = env.MOVIES.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, request.body);

  // The etag is R2's receipt for this piece. The browser keeps all
  // the receipts and hands them back at the end.
  return json({ partNumber: part.partNumber, etag: part.etag });
}

async function completeUpload(request, env, user) {
  const body = await request.json();

  checkOwnKey(user, body.key);

  if (!body.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
    throw new HttpError(400, "The list of pieces is missing.");
  }

  const upload = env.MOVIES.resumeMultipartUpload(body.key, body.uploadId);
  const object = await upload.complete(body.parts);

  // The size the browser promised at the start could be a lie.
  // Now we know the real size, so check it again.
  if (object.size > MAX_VIDEO_BYTES) {
    await env.MOVIES.delete(body.key);
    throw new HttpError(400, "The video must be 5 GB or smaller.");
  }

  return json({ key: body.key, size: object.size });
}

async function abortUpload(request, env, user) {
  const body = await request.json();

  checkOwnKey(user, body.key);

  if (!body.uploadId) {
    throw new HttpError(400, "The upload id is missing.");
  }

  await env.MOVIES.resumeMultipartUpload(body.key, body.uploadId).abort();
  return json({ aborted: true });
}

async function deleteFile(request, env, user) {
  const key = new URL(request.url).searchParams.get("key");

  checkOwnKey(user, key);

  await env.MOVIES.delete(key);
  return json({ deleted: true });
}

// ---------------------------------------------------------------
// Cloudflare calls this function for every /api/... request.
// ---------------------------------------------------------------
export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  // For /api/upload/start, params.path is ["upload", "start"].
  const route = request.method + " " + (context.params.path || []).join("/");

  try {
    if (!env.MOVIES) {
      throw new HttpError(500, "Uploads are not set up: the MOVIES bucket is not linked.");
    }

    const routes = {
      "POST upload/start": startUpload,
      "PUT upload/part": uploadPart,
      "POST upload/complete": completeUpload,
      "POST upload/abort": abortUpload,
      "DELETE file": deleteFile,
    };

    const handler = routes[route];
    if (!handler) {
      throw new HttpError(404, "There is nothing at this address.");
    }

    const user = await getUser(request, env);
    return await handler(request, env, user);
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ message: error.message }, error.status);
    }
    // Anything else is a surprise. The details go to the Cloudflare
    // log, not to the visitor.
    console.error(route, error);
    return json({ message: "The server had a problem. Please try again." }, 500);
  }
}
