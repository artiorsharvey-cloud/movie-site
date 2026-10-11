// ---------------------------------------------------------------
// SERVER CODE: signed links
//
// A <video> player cannot send a login token. So how can the
// server know that the person watching has paid?
//
// Answer: when a subscriber opens a movie, the server gives them a
// special link that only works for a few hours. The link has a
// SIGNATURE on the end: a long code made from the file's path, the
// time the link stops working, and a secret that only the server
// knows. Nobody can make a valid link without the secret, and
// changing the path or the time breaks the signature.
//
// This kind of signature is called an HMAC.
// ---------------------------------------------------------------

// How long a link works: 6 hours. Enough for a long movie with breaks.
export const LINK_SECONDS = 6 * 60 * 60;

// Make the signature for one file and one end time.
export async function sign(secret, key, expires) {
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const bytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(key + "\n" + expires));

  // Turn the bytes into text like "9f3a0c..."
  return Array.from(new Uint8Array(bytes))
    .map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    })
    .join("");
}

// Is this link real and still in time?
export async function isValid(secret, key, expires, signature) {
  const expiresNumber = Number(expires);

  if (!signature || !Number.isInteger(expiresNumber) || expiresNumber < Date.now() / 1000) {
    return false;
  }

  const expected = await sign(secret, key, expiresNumber);

  // Compare every letter, even after finding a wrong one. Stopping
  // early would let an attacker measure the time and guess the
  // signature letter by letter.
  if (expected.length !== signature.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return difference === 0;
}
