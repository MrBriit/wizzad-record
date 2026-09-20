# The Wizzad Record — profile v0.1

*What a Wizzad study record is, how it is signed, and how anyone can check it without asking Wizzad.*

Status: v0.1, 20 September 2026. This document describes what Wizzad issues today. Anything a verifier relies on is here; anything not here is not promised.

## 1. What the record is, and is not

A Wizzad study record reports **what happened in Wizzad**: which questions were put to a student about a piece of their own work, how the answers were checked, and what was recorded while they answered. Every attempt is kept; a later attempt never replaces an earlier one.

It does **not** establish who wrote any piece, whether AI was used in writing it, or who the student is. Nothing in it is a verdict, a comparison with other students, or an examination result. A verifier that finds a record *valid* has established exactly two things:

1. **Integrity** — the record's bytes are the bytes Wizzad signed; nothing was changed afterwards.
2. **Issuer** — the signature was made with a key Wizzad publishes as its own.

Whether the person who shows you the record is the student it describes is a separate question that the record answers only as far as its own *identity* lines say (a signed-in account, a passkey at the start of a session). The record says so itself; a verifier must not upgrade that.

## 2. The record document

A record is served at `https://<host>/api/proof/shared/<token>`, where `<token>` is the link the student made. The document is JSON:

```json
{
  "status": "ok",
  "payload": { … },
  "signature": "<base64url, 64 bytes>",
  "algorithm": "Ed25519",
  "keyId": "<16 hex characters>",
  "sharedAs": "<the name the student entered, or null>",
  "note": "…"
}
```

Only `payload` is signed. `signature`, `algorithm` and `keyId` describe the signature; `sharedAs` and `note` are unsigned and carry no weight.

### 2.1 The payload

| Field | Meaning |
|---|---|
| `schema` | `"wizzad.proof/v1"`. A different value is a different profile; refuse it. |
| `recordId` | The record's own id. |
| `issuedAt` | When the record was issued, ISO 8601, UTC. |
| `windowDays` | The period the study activity covers, in days, ending at `issuedAt`. |
| `subject.ownerTag` | An opaque tag for the account. Not a name, not an email; stable across a student's records. |
| `record` | The counts: `defenses[]` (one per kept attempt — the piece's title, the date sealed, the attempt number, the results, how the student was identified, timing, and for a piece made elsewhere its file type and SHA-256; for a piece written in Wizzad, how it was made), `concepts[]`, `totals`, `retrievalPct`, `since`, `attribution`. The reader page renders these; the profile does not fix their inner shape beyond what §4 needs. |

### 2.2 Canonical form

The signature covers the **canonical JSON** of `payload`: `JSON.stringify` of the payload with every object's keys sorted (code-point order) at every depth, arrays in place, no whitespace, UTF-8. Re-serialising a record — pretty-printing it, re-ordering keys, moving it between systems — does not change what was signed. (`src/canonical.js` is the whole algorithm, fifteen lines.)

### 2.3 The signature

Ed25519 (RFC 8032, pure, no pre-hash) over the UTF-8 bytes of the canonical form. `signature` is the 64-byte signature, base64url without padding. `algorithm` is always `"Ed25519"`.

### 2.4 The keys

Wizzad publishes its public keys at `https://<host>/api/proof/keys`:

```json
{ "keys": [ { "keyId": "1b08271a2234fbce", "algorithm": "Ed25519", "publicKey": "<SPKI DER, base64>", "publicKeyPem": "-----BEGIN PUBLIC KEY-----…" } ], … }
```

* `keyId` is the first 16 hex characters of SHA-256 over the key's SPKI DER encoding — so an id can be recomputed from the bytes, and a document cannot claim an id its key does not have. A verifier **must** recompute it.
* The list carries the key that signs today **first**, then any retired keys. A retired key never signs again, but a record signed under it keeps verifying. A record naming a key that is not in the list cannot be checked, and a verifier must say so rather than try another.
* The same keys appear as Multikeys (`z6Mk…`, multicodec `0xed01` + 32 bytes) in the issuer's DID document (§3.3). The two publications are the same keys; a verifier may use either.

### 2.5 Checking a record

1. Take `payload`; compute its canonical form (§2.2).
2. Find the key named by `keyId` among the published keys; recompute the id from the bytes; refuse if absent or mismatched.
3. Verify the Ed25519 signature over the canonical bytes.
4. Report *valid* only if 2 and 3 both pass. Report the key id and the SHA-256 of the canonical form so two people can compare what they checked.

`wizzad-record check <link>` does exactly this; `web/index.html` does it in a browser with WebCrypto.

## 3. The credential

A task a reader set and the student finished and defended is issued as an **Open Badges 3.0** credential — a W3C Verifiable Credential (Data Model 2.0) — at `https://<host>/api/proof/shared/<token>/tasks/<taskId>/credential`, media type `application/ld+json`.

### 3.1 Shape

* `@context`: exactly `["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"]`. Both contexts are bundled in this package (`contexts/`), pinned by URL, and never fetched; a credential naming any other context is refused.
* `type`: `["VerifiableCredential", "OpenBadgeCredential"]`.
* `id`: `https://<host>/proof/credentials/<id>` — the credential's own address, where the same document can be fetched again.
* `issuer`: a `Profile` whose `id` is the issuer's DID (§3.3), with Wizzad's name, url and a description that says what the credential is not (a grade, a verdict, an identity check).
* `credentialSubject.achievement`: the task as set (`achievementType: "Assignment"`, `name` = the task's title, `criteria.narrative` = the sitting rule and how the making was recorded, `resultDescription` for the defense's counts), with `result` and a `narrative` in the record's own words.
* `credentialSubject.identifier`: two unhashed `IdentityObject`s — the record's id (`identityType: "identifier"`) and the name **as the student entered it** (`identityType: "name"`). Wizzad has not checked that name; the record says so, and a verifier must not read it as an identity check.
* `validFrom`: when the credential was issued.
* `proof`: a `DataIntegrityProof`, `cryptosuite: "eddsa-rdfc-2022"`, `proofPurpose: "assertionMethod"`, `verificationMethod: "<issuer DID>#<keyId>"`, `created`, and `proofValue` (multibase base58-btc, a 64-byte Ed25519 signature).

### 3.2 Checking a credential (eddsa-rdfc-2022)

1. Remove `proof` from the document (the *unsecured document*); remove `proofValue` from the proof (the *proof configuration*), and give the configuration the document's `@context`.
2. Canonicalise both with RDFC-1.0 (formerly URDNA2015) to N-Quads, in *safe* mode (a term the contexts do not define is an error, not dropped), resolving the two contexts from the bundle only.
3. Hash each canonical form with SHA-256; the bytes to verify are `sha256(configuration) ‖ sha256(document)`.
4. The key is the fragment of `verificationMethod`, looked up as in §2.4 (the DID document or the keys list).
5. Verify the Ed25519 signature in `proofValue` over those bytes.

`wizzad-record credential credential.json --keys did.json` does exactly this. It needs the `jsonld` library for step 2, which is why the browser page does not check credentials.

### 3.3 The issuer's DID

The issuer is `did:web:<host>:proof:issuer`, resolving (per did:web) to `https://<host>/proof/issuer/did.json`. The document lists every published key as a `Multikey` verification method with id `<DID>#<keyId>`, usable for `assertionMethod`. The `keyId` fragment is the same id as in §2.4.

## 4. Files the record vouches for

Where a piece was brought into Wizzad as a file, or a recording was kept, the payload carries the file's **SHA-256 over its exact bytes** as a `sha256` field (`record.defenses[i].elsewhere.sha256`; `record.defenses[i].capture.clips[j].sha256`). A reader who holds a copy hashes it and looks for the same code; the file itself goes nowhere. `wizzad-record file <path> <link>` and the browser page's step 2 do this. A match means *this is the file the record was made from*; the record says nothing about a file it does not name.

## 5. Versioning

This is profile **v0.1**. The payload's `schema` (`wizzad.proof/v1`) names the payload's shape; this document names the signing and credential profile. A change to canonicalisation, the signature algorithm, the key publication, the credential's contexts or its cryptosuite will bump this document's version and will not be applied retroactively to records already issued: what was signed stays checkable as it was signed.

## 6. What a verifier must not do

* Must not accept a key that is not among the published keys, whatever a record or a credential says about it.
* Must not treat `sharedAs`, `note`, or anything outside `payload` as signed.
* Must not fetch a JSON-LD context from the network to check a credential.
* Must not report *valid* for integrity alone when the key check failed, or read *valid* as a statement about who the student is or how the piece was written. The record's own words carry those limits; keep them beside any result you show.
