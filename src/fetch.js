/**
 * The three documents a link leads to, fetched from the link's own origin:
 * the signed record, the published keys and the issuer's DID document. The
 * verification itself never touches the network — these are inputs.
 */
export function partsOfLink(link) {
  const u = new URL(link);
  const m = u.pathname.match(/\/proof\/([A-Za-z0-9_-]+)\/?$/);
  if (!m) throw new Error('not a record link (expected …/proof/<token>)');
  return { origin: u.origin, token: m[1] };
}

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

/** `{ record, keys, did }` for a link. `did` is null when the issuer document is not served. */
export async function fetchFromLink(link) {
  const { origin, token } = partsOfLink(link);
  const [record, keys] = await Promise.all([getJson(`${origin}/api/proof/shared/${token}`), getJson(`${origin}/api/proof/keys`)]);
  const did = await getJson(`${origin}/proof/issuer/did.json`).catch(() => null);
  return { origin, token, record, keys, did };
}
