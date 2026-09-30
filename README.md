# wizzad-record

Check a [Wizzad](https://wizzad.ai) study record — its signature, its Open Badges 3.0 credential, and the files it names — **without trusting Wizzad**. No Wizzad code, no Wizzad server in the loop: the record and the public key are documents anyone can download, and this checks them with standard cryptography.

If you are the person reading a record, start with **[What a Wizzad record is](https://mrbriit.github.io/wizzad-record/web/record.html)** — plain words on what it tells you, what it does not, and what *valid* means.

Engineers: read [the Defended Work Standard](PROFILE.md): it says what a record is, what each of its five parts — the brief, the making, the deliverables, the defense, the record — carries and how to check it, what *valid* means, and what it does not mean.

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

## Check a host's word

A sitting sat with a host in the room carries, once the host has signed, the host's own word — a WebAuthn assertion their passkey made over a statement (*I watched this sitting from start to finish*, any exceptions, a note), with the host's public key. `check` prints one line per such sitting and checks the word under that key, with Node's `crypto` alone:

```
host     record.defenses[0] · Elena Marsh, Example College (example.edu) signed 2026-10-06T15:24:00.000Z · watched the whole sitting · key 3f1c…  · VALID
host     record.defenses[1] · sat with Elena Marsh, Example College (example.edu) · awaiting the host’s word
```

Where the host's window recorded the sitting, the line sets the rule beside what the sitting carries — `window required camera and screen; sitting carries both`, or, honestly, `sitting carries the camera only` ([§4.4.1](PROFILE.md#441-a-sitting-with-a-host-in-the-room), v1.4).

*Valid* means the holder of that passkey signed those words about that sitting — see [the standard, §4.4.1](PROFILE.md#441-a-sitting-with-a-host-in-the-room) for what it does and does not say. A word that does not hold makes `check` exit 1.

A host may instead give their word through Wizzad — signed in, they confirm the statement, or they open a one-time link sent to their confirmed school address — and Wizzad signs the statement with the record's own key ([§4.4.2](PROFILE.md#442-a-word-given-through-wizzad)). `check` then checks Wizzad's signature under the published keys and says so in the line: it is Wizzad's word that the host gave it, not the host's own key.

```
host     record.defenses[0] · Elena Marsh, Example College (example.edu) confirmed through their Wizzad account 2026-10-06T15:24:00.000Z · watched the whole sitting · Wizzad’s signature, key 798e…  · VALID (Wizzad’s word that the host gave it)
```


## Check a standing

A record may carry each piece's standing ([§4.6](PROFILE.md#46-the-standing)): what supervised sittings on that piece found, with its remote sittings beside them. `check` recomputes each one from the sittings the record carries — counting a supervised sitting only when its host's word holds — and prints one line per piece:

```
standing record.standings[0] · Osmosis lab · Verified · supervised 7 of 10 (1 sitting) · remote 10 of 10 (1 sitting) · MATCHES its sittings
```

*Matches* means the status is one the rules allow for those sittings. A gap status reaches a student only after Wizzad has reviewed it, so a record may carry a milder status than its numbers would give — never a harsher one. The line prints the pooled credit, not the gap, so it never states a status a review has not released; the numbers are in the record for anyone to compute (§4.6). A piece renamed between sittings is one standing, titled as its newest sitting. A standing that does not match makes `check` exit 1.
## Read a person's review

Questions are made by an AI and explanations graded by AIs. A student may ask for a person to review a sitting, and a review that changed something is carried on that sitting ([§4.4.3](PROFILE.md#443-a-persons-review)): answers the person regraded — the results are then as counted after the review, with the results as sealed kept beside them — or the sitting set aside, which counts toward no standing. `check` prints each one:

```
review   record.defenses[0] · reviewed by Ama Owusu, Wizzad on 2026-10-02 · 1 answer regraded by that person: results are as counted after the review; the results as sealed are kept beside them · Wizzad’s word, signed with the record
review   record.defenses[2] · reviewed by Ama Owusu, Wizzad on 2026-10-02 · set aside: carried as sealed, counts toward nothing · Wizzad’s word, signed with the record
```

The review is inside the signed record, so it is Wizzad's word that the person it names decided this — no more. A review that left the result as it was is not carried.


## Check a credential

```bash
wizzad-record credential credential.json --keys did.json
```

verifies the credential's `eddsa-rdfc-2022` Data Integrity proof: RDFC-1.0 canonicalisation with the two bundled contexts (never fetched), SHA-256, Ed25519 under the key `verificationMethod` names.

## Check a file you hold

```bash
wizzad-record file essay.docx https://wizzad.ai/proof/<token>
```

hashes your copy (it stays on your machine) and tells you whether the record vouches for that exact file, and where the record names it. The files a record can name are the ones its own page lists: a piece brought in, a project's brief and each file handed in, a notebook re-run's outputs, the code and output of each run made during a defense, a lab-notebook photo, and each recording. A fingerprint that is not of a file (a lab-notebook entry's, which is over its words) is not matched.

## Check a notebook re-run

```bash
wizzad-record reproduce analysis.ipynb https://wizzad.ai/proof/<token>
```

finds the re-run the record carries for this exact notebook (by its fingerprint), checks the files beside it (looked for next to the notebook, or in `--files <dir>`), and recomputes the record's `outputs.submitted` digest from the notebook alone — nothing runs:

```
record    VALID · key 1b08271a2234fbce
notebook  analysis.ipynb · sha256 129c4a201f42… · the notebook the record’s re-run used (“Road salt” sealed 2026-09-24)
input     data.csv · matches
submitted 1413c4aba2fc… · MATCHES the record — recomputed from the notebook alone (4 code cells, canonical form 2)
says      Results reproduced: every one of its 4 code cells gave the outputs submitted. Wizzad’s run, on 2026-09-24, no network, Python 3.10.12.
```

Add `--run` to run it yourself, the way Wizzad did: the notebook and its files copied into an empty directory, the code cells run in order in one fresh Jupyter kernel, compared with the submitted outputs cell by cell, and your run's digest set beside the record's. It needs a Python with `jupyter_client` and `ipykernel` (`--python <path>` to name one). **`--run` executes the notebook's code on your machine, with your permissions and your network** — run it where you would run code from a stranger. Where your run and Wizzad's differ, look at the environment first: the record names the Python and package versions its run used.

The canonical form the digests are over is in [the standard, §4.3.2–4.3.3](PROFILE.md), with test vectors. A record says which of its two rules read the notebook (`canon`), and the command reads it by that rule.

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

`0` — everything checked is valid (for `reproduce --run`: and your run's digest is the record's). `1` — something is not, or could not be checked (the reason is printed). `2` — usage.

## Tests

```bash
npm test
```

The fixtures under `test/fixtures/` are real signed documents from a Wizzad development deployment (hence the `localhost` host in the DID) — a signed record, its keys list, the issuer's DID document and an issued credential — and the tests tamper with each to show the checks fail when they should.

## Requirements

Node.js 18.17 or later. One dependency, `jsonld`, for the credential check. `reproduce --run` also needs Python 3 with `jupyter_client` and `ipykernel`.

## Licence

MIT.
