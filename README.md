# wizzad-record

Check a [Wizzad](https://wizzad.ai) study record — its signature, its Open Badges 3.0 credential, and the files it names — **without trusting Wizzad**. No Wizzad code, no Wizzad server in the loop: the record and the public key are documents anyone can download, and this checks them with standard cryptography.

If you are the person reading a record, start with **[What a Wizzad record is](https://mrbriit.github.io/wizzad-record/web/record.html)** — plain words on what it tells you, what it does not, and what *valid* means. Engineers: [PROFILE.md](PROFILE.md) is the exact profile.

## Check a record

```bash
npx wizzad-record check https://wizzad.ai/proof/<token>
```

fetches the signed record and the published keys from the link's own origin and verifies the Ed25519 signature over the record's canonical JSON:

```
record   VALID
key      1b08271a2234fbce · published · keys from the link’s origin
digest   sha256(canonical payload) = 581203df…
issued   2026-09-20T07:03:03.354Z
```

Offline, with the two documents saved:

```bash
wizzad-record check record.json --keys keys.json     # keys.json: /api/proof/keys, or the issuer's did.json
```

## Check a credential

```bash
wizzad-record credential credential.json --keys did.json
```

verifies the credential's `eddsa-rdfc-2022` Data Integrity proof: RDFC-1.0 canonicalisation with the two bundled contexts (never fetched), SHA-256, Ed25519 under the key `verificationMethod` names.

## Check a file you hold

```bash
wizzad-record file essay.docx https://wizzad.ai/proof/<token>
```

hashes your copy (it stays on your machine) and tells you whether the record vouches for that exact file.

## In a browser

Open **https://mrbriit.github.io/wizzad-record/web/** (or `web/index.html` locally) — a single page with no dependencies. Paste the record's link, or paste the two documents by hand, and it checks the signature with WebCrypto; drop a file to compare it with the record. Credentials need the command line (RDF canonicalisation is a library, not a page).

## As a library

```js
import { verifyRecord, verifyCredential, keyRing, fingerprintFile, matchFingerprint } from 'wizzad-record';
const { valid, reason, keyId, canonicalSha256 } = verifyRecord(record, keys);
const cred = await verifyCredential(credential, did);
```

Every function is pure over its inputs; only `fetchFromLink` touches the network, and only the link's origin.

## Exit codes

`0` — everything checked is valid. `1` — something is not, or could not be checked (the reason is printed). `2` — usage.

## Tests

```bash
npm test
```

The fixtures under `test/fixtures/` are real signed documents from a Wizzad development deployment (hence the `localhost` host in the DID) — a signed record, its keys list, the issuer's DID document and an issued credential — and the tests tamper with each to show the checks fail when they should.

## Requirements

Node.js 18.17 or later. One dependency, `jsonld`, for the credential check.

## Licence

MIT.
