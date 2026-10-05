# The Defended Work Standard — v1.11

*What a piece of defended work is, what its signed record says about each of its five parts, and how anyone can check each part without asking Wizzad.*

Status: v1.11, 5 October 2026. v1.11 changes what a standing's status may say (§4.6): a standing carries `minimum`, the share of credit its supervised sittings must reach (half) before it stands as a supervised sitting on record; a gap no person at Wizzad has reviewed is carried as `awaiting_review`, never as `verified`; and no label says *Verified* — the codes keep their names for every record made before, which reads exactly as it did. v1.10 adds one word for the room (§4.4.4): a host who watched many sittings in one window may give one word for all of them — one signature over a room statement that names each sitting only by a hash — and each sitting's record carries the room with its own statement, never another student's; every word and record made before it reads exactly as it did. v1.9 adds the school that admitted a host (§4.4.1): an optional `supervised.school` — the school's name as approved, its domain, and how it came to be a school on Wizzad (`approvedBy`); every record made before it reads exactly as it did. v1.8 adds a standing's band, read from its pools once three sittings count (§4.6); on a defense, how many of its questions had been asked in an earlier sitting on the piece (`askedBefore`, §4.4); and the council of AI graders (§4.4): an optional `council` on a defense — how many AI graders read the explanations, and how often they agreed blind and after conferring — and `grading.explained.thirdModel`; and, on a defense, the time the sitting allowed (`timing.allowed`) and how it was answered (`manner`); every record made before it reads exactly as it did. v1.7 adds a person's review of a sitting (§4.4.3): an optional `review` on a defense — answers a person regraded, or a sitting set aside — and a sitting set aside counts toward no standing (§4.6); every record made before it reads exactly as it did. v1.6 adds a sitting hosted by a reader of the student's record who asked for it (§4.4.1): an optional `supervised.readerHosted`; every record made before it reads exactly as it did. v1.5 adds each piece's standing (§4.6): what supervised sittings on a piece found, with its remote sittings beside them, recomputable from the record alone; every record made before it reads exactly as it did. v1.4 adds the window's recording rule (§4.4.1): an optional `supervised.recording` beside the sitting's `capture`, and the same field in the host's statement; every word and record made before it reads exactly as it did. v1.3 adds two ways a host may give their word through Wizzad (§4.4.2), each disclosed on the record and checked under Wizzad's published keys; every word given before it reads exactly as it did. v1.2 added the sitting with a host in the room (§4.4.1). v1.1 adds a second rule for reading a notebook's own outputs (§4.3.2), and a field that says which rule a reproduction used; it also adds optional `timeZone` fields, which say which zone a record's calendar days are in (§3.1). Every record made before it reads exactly as it did. v1 superseded the Wizzad Record profile v0.1 (20 September 2026). The signing, keys and credential sections (§5–§7) are unchanged, and every record issued under v0.1 checks exactly as it did. This document describes what Wizzad issues today. Anything a verifier relies on is here; anything not here is not promised.

## 1. The standard on one page

A piece of **defended work** is a project a student made, handed in as files, and then answered questions about. Its record has five parts:

| Part | What the record carries | How a reader checks it without Wizzad | Rests on |
|---|---|---|---|
| **I. The brief** | The task as fixed before the work, its fingerprint, the day it was fixed, and who fixed it (§4.1) | Recompute the fingerprint from the brief's words; ask the named setter | The words: checkable. Who set it: the student's word, or a reader's link |
| **II. The making** | How the piece came to be: pages, the order of the files, and, for a piece written in Wizzad, its saved history (§4.2) | The order of the days is on the record; the history is Wizzad's observation | Wizzad's observation, signed |
| **III. The deliverables** | Each file by fingerprint; a notebook re-run from nothing but those files; a spreadsheet model recalculated (§4.3) | Hash your copies; recompute the notebook's outputs digest; re-run it yourself; recalculate the model | Checkable, file by file and cell by cell |
| **IV. The defense** | The questions drawn from the parts, answered under time with the piece out of sight; counts, never grades; the recording, by fingerprint (§4.4) | Watch the recording through a link that carries it, and hash the file; read the answers through a link that carries them | The counts: Wizzad's grading, signed. The recording: checkable |
| **V. The record** | All of the above, signed with Ed25519, and, for a task, issued as an Open Badges 3.0 credential (§5–§7) | `wizzad-record check`, or the browser page | Checkable, with standard cryptography |

Three rules hold across all five parts:

1. **Counts, never verdicts.** Every figure sits beside its total. Nothing in a record says a piece is good, original, or the student's own.
2. **Say what rests on whose word.** Where a reader can check a part from files they hold, or by doing the work again, this document says how. Where a part could only be seen while it happened (the typing, the grading, the session), it is Wizzad's observation, signed, and this document names it as such.
3. **The standard is public.** This document is the whole of it. `wizzad-record` is a reference implementation, not a second source of truth.

## 2. What a record is, and is not

A Wizzad record reports **what happened in Wizzad**:

* which questions were put to a student about a piece of their own work;
* how the answers were checked;
* what was recorded while they answered;
* for a project, what the files on record do when run again.

Every attempt is kept; a later attempt never replaces an earlier one.

A record does **not** establish:

* who wrote any piece, or whether AI was used in making it;
* who the student is, beyond control of the account and, where the record says so, a passkey at the start of a session;
* a grade, a verdict, or a comparison with other students;
* that data were collected as described. A re-run shows what the files do, not how the data in them came to be. For a science project, the bench work itself is never re-run.

A verifier that finds a record *valid* has established two things:

1. **Integrity:** the record's bytes are the bytes Wizzad signed, and nothing was changed afterwards.
2. **Issuer:** the signature was made with a key Wizzad publishes as its own.

Everything else a reader concludes comes from reading the parts below, with their limits kept beside them. The plain-language meaning of each sentence a record shows is at `https://<host>/proof/guide`.

## 3. The record document

A record is served at `https://<host>/api/proof/shared/<token>`, where `<token>` comes from the link the student made. The document is JSON:

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

Only `payload` is signed:

* `signature`, `algorithm` and `keyId` describe the signature.
* `sharedAs`, `note`, and any other field outside `payload` are unsigned and carry no weight.

### 3.1 The payload

| Field | Meaning |
|---|---|
| `schema` | `"wizzad.proof/v1"`. Any other value is a different payload; refuse it. |
| `recordId` | The record's own id. |
| `issuedAt` | When the record was issued, ISO 8601, UTC. |
| `windowDays` | The period the record covers, in days, ending at `issuedAt`. |
| `subject.ownerTag` | An opaque tag for the account. It is not a name or an email, and it is stable across one student's records. |
| `record.defenses[]` | One entry per kept attempt at defending a piece (§4). |
| `record.concepts[]`, `record.totals`, `record.retrievalPct`, `record.since`, `record.attribution` | The student's practice in Wizzad over the window: counts by topic, and how answers were checked. The guide explains each one; this standard does not fix their inner shape. |
| `record.pieceChoice` | `{shown, onRecord}`. Present when the student chose which pieces this record shows, so that a partial record never looks complete. |
| `record.schoolEmail` | `{domain, confirmedOn, how}`: a school address the student showed they read mail at. `how` is `code` (a code sent there was typed back) or `account` (it is the account's verified address). Only the domain is carried, never the address. |
| `record.briefConfirmations[]` | Answers from the people students named as setting a brief (§4.1). |
| `record.briefConfirmationsWithheld` | How many replies were left out because they failed their own check at issue, so that the record never looks complete when a reply is missing. |
| `record.claimConfirmations[]` | Answers from the people a student named about a claim beyond a piece: a job, a paper, a course, an award, an activity, a teammate, a reference letter (§3.2). |
| `record.claimConfirmationsWithheld` | As `briefConfirmationsWithheld`, for those answers. |
| `record.timeZone` | The IANA time zone the student was in when the record was issued, such as `America/New_York`. The days the record states of its own period, and the `confirmedOn` and `answeredOn` days fixed at issue, are days in it. |

**Absent is not zero.** Fields were added over time. A missing field means the record does not carry it: either the record was issued before the field existed, or the part did not apply. It never means none, no, or false. A verifier must say "not carried", not "0".

**Dates and time zones.** Instants (`issuedAt`, and every moment carried as an ISO 8601 string) are UTC, and `timeZone`, where an object carries one, is the IANA time zone the student was in when that part happened — for display only, and covered by the signature — so the calendar days (the `…On` fields) in that object, and in the objects inside it that carry no `timeZone` of their own, are days in that zone, while a day with no `timeZone` above it is a UTC day.

### 3.2 Claims others confirmed

A student can ask the person a claim names (a supervisor, a co-author, an instructor, an award's organizer, a teammate, a reference writer) whether it is right. Each answer is carried in `record.claimConfirmations[]` as `{words, sha256, answer: "yes" | "no", name, relation, grade, note, domain, answeredOn, askedAs}`.

* `words` is the claim as the student wrote it and the answerer saw it: `{kind, title, org?, role?, when?, detail?, grade?}`. `kind` is one of `experience`, `research`, `course`, `award`, `activity`, `teammate`, `letter`. `grade` appears only on a course, and it is the grade the student says they received.
* `sha256` is the claim's fingerprint: SHA-256, lowercase hex, over the UTF-8 bytes of `words` written as compact JSON (no spaces), with keys in the order `kind, title, org, role, when, detail, grade` and empty fields left out. The JSON is written as ECMAScript's `JSON.stringify` writes it: non-ASCII characters appear as themselves, and only `"`, `\` and control characters are escaped. (Python's `json.dumps` escapes non-ASCII by default; pass `ensure_ascii=False, separators=(",", ":")`.) A reader recomputes it from `words` and compares.

  Test vector: `{"kind":"research","title":"The paper’s title","org":"Café symposium"}` → `1f2c0c8ecb14a3632d48574f4949e6a550772908b7c2063c1891a22a5948b357`.
* `askedAs` is the student's name as the request gave it: the name the answerer was asked about. The student typed it, and it is unchecked; a reader sets it beside the name the portfolio carries. Absent on answers given before it was carried.
* An answer establishes only that *someone reading mail at that domain* answered, on that day, about those words and that name. The student chose the address; the domain says where the link went, not who opened it.
* `name` and `relation` (how they know the student) are as they typed them.
* On a course whose `words` carry a grade, `yes` confirms that grade too: the answerer is told so, and is not asked for another. `grade` is carried only when the student's words had none, and it is the answerer's own words. Wizzad gives no grade.
* `no` is carried as plainly as `yes`.
* For `kind: letter`, `yes` means the writer said they are writing a reference, or have written one. The letter itself is never carried.
* A request nobody answered is not carried.

## 4. A defended piece: the five parts

Each entry in `record.defenses[i]` is one kept attempt:

| Field | Meaning |
|---|---|
| `id` | The defense's own id; it finds the attempt's recording behind a link. Absent on early records. |
| `title` | The piece's title, as the student named it. |
| `sealedOn` | The day the attempt was sealed, `YYYY-MM-DD`: a day in `timeZone` when the entry carries one, otherwise a UTC day (§3.1). Never the time. |
| `timeZone` | The IANA time zone the student was in when the attempt began. The days of `sealedOn` and `made` are days in it. Absent on attempts sealed before it was carried, or when no zone was known. |
| `attempt` | Which attempt at this piece, counted from 1. |
| `practisedBefore` | How many practice sittings on the piece were sealed before this one began. Since v1.8 a sitting asks only questions not asked before on the piece, practice included (`askedBefore`); before v1.8 a sitting after practice was asked practice’s own questions. |
| `identity` | `session`: the usual sign-in. `passkey`: the student confirmed presence with a passkey when the session began. Neither is an identity check. |
| `project` | Present when the piece is a project with a brief and files. Parts I–III, and most of Part IV, live here. A page written in Wizzad, or a single piece brought in, has no `project`. |

### 4.1 Part I: the brief

`project.brief` = `{text, setBy, sha256, enteredOn, source, timeZone?}`.

`text` is the brief as fixed, word for word. `enteredOn` is the day it was fixed: a day in `brief.timeZone` (the zone the student started the project in) when present, otherwise a UTC day. The day each file was handed in sits beside it (§4.3), so a reader can see for themselves whether the brief came before the work.

**The fingerprint.** `sha256` is SHA-256, lowercase hex, over the UTF-8 bytes of the brief's *canonical text*. To get the canonical text:

1. Replace every `\r\n`, and every lone `\r`, with `\n`.
2. Remove spaces and tabs that stand right before a `\n`.
3. Trim whitespace from both ends.

A reader recomputes the fingerprint from `text` and compares. A text file holding the brief matches only if it holds exactly the canonical text; an editor's final newline changes the hash.

**Who fixed it.** `source` says:

| `source` | Meaning | `setBy` |
|---|---|---|
| `student` | Typed or pasted by the student. | A setter the student named (**unchecked**), or null. |
| `task` | Set by a reader through a link; the server fixed its words and its clock. | The reader, as they gave their name. |
| `course` | Fixed from a course link. | The setter the link's maker named (**unchecked**), or null. |
| `suggested` | Drafted by Wizzad from a listed case and kept unchanged by the student. The words are Wizzad's, and the record says so. | null |

**The pack.** `project.pack` is `business-case`, `science`, or absent for a data project. For a business case, `project.case` = `{title, publisher, number, url}` is a *reference* to the case. It is never the case's text, which Wizzad does not hold.

**Asking the setter.** When a student names a setter, that person can be asked by mail whether they set the brief. Each answer is carried in `record.briefConfirmations[]` as `{project, briefSha256, answer: "set" | "not_set", name, grade, note, domain, answeredOn}`, bound to the brief by its fingerprint.

* An answer establishes only that *someone reading mail at that domain* answered, on that day, about the brief with that fingerprint.
* `name` is as they typed it.
* `not_set` is carried as plainly as `set`.
* `grade` is the answerer's own words. Wizzad gives no grade.

### 4.2 Part II: the making

What the record says about how a piece came to be depends on where it was made. Most of it is **Wizzad's observation**: signed, and corroboration for the rest, but not re-checkable from files and not proof on its own. The one exception is a piece brought in from elsewhere, whose fingerprint a reader can check.

* **A piece written in Wizzad.**
  * `made` = `{firstSavedOn, lastSavedOn, days, sessions, saves, added: {typed, pasted, assisted, other}, chars, seen, composition?}`. It counts the saved states kept while the piece was open, and how many characters were added by each route.
  * `seen` says whether the defended version is one of those saved states.
  * `composition` holds four counts about the typing, with their denominators and no label.
  * `checkpoints` = `{offered, answered}`: one ungraded question asked at the end of each writing sitting.
  * `essay` describes an application essay: its kind, the prompt as recorded, the limit, and its length at the defended version.
* **A piece made elsewhere and brought in.**
  * `elsewhere` = `{file, sha256}`. `file` is the file type it arrived as, or null when it was pasted.
  * `sha256` is over *exactly the bytes that arrived*: the file's bytes or, for pasted text, the UTF-8 bytes of the text tidied the same way as the brief (§4.1).
  * This part is checkable: hash your copy (§8).
* **A project.**
  * `project.pages` counts the pages written for it.
  * The files' `handedInOn` days (§4.3) show the order in which the work arrived.
  * `project.entries[]` = `{on, sha256, photo}` appears only on science records sealed while Wizzad kept a lab notebook, which it no longer does. Each entry's `sha256` is over its moment and its words, which the record does not carry, so it is **not** a file fingerprint. `photo`, when present, is the fingerprint of the photo's bytes.

None of this shows who was at the keyboard, or what was written somewhere else first.

### 4.3 Part III: the deliverables

`project.deliverables[]` = `{file, role, bytes, sha256, handedInOn, timeZone?}`, one entry for each file handed in.

* `sha256` is SHA-256, lowercase hex, over the file's exact bytes.
* `bytes` is its length.
* `handedInOn` is the day it arrived: a day in the entry's `timeZone` (the zone it was handed in from) when present, otherwise a UTC day.
* `role` comes from the file's extension:

| Extensions | `role` |
|---|---|
| `ipynb` | `notebook` |
| `xlsx`, `xlsm`, `xls` | `model` |
| `csv`, `tsv`, `json`, `parquet`, `sav`, `dta` | `data` |
| `py`, `r`, `jl`, `js`, `ts`, `sql`, `m` | `code` |
| `pptx`, `key`, `odp` | `deck` |
| `docx`, `doc`, `md`, `txt`, `rtf` | `memo` |
| `pdf` | `report` |
| anything else | `other` |

A reader who holds the files hashes each one and finds it in the list (§8). Holding the files is what makes everything below checkable.

#### 4.3.1 The reproduction

`project.reproduction` records a run of the project's notebook, made by Wizzad from nothing but the files on record and compared cell by cell with the outputs the student submitted. It is null when no run was made. The words a reader sees follow ACM's artifact badges:

| `status` | Words shown | Meaning |
|---|---|---|
| `reproduced` | Results reproduced | Every code cell ran and gave the outputs the student submitted. |
| `ran` | Ran without error | No cell raised an error, but some cells' outputs differed (`cells.differingAt`). |
| `failed` | Did not run | Code cell `cells.failedAt` raised an error. The cells after it were not run. |

| Field | Meaning |
|---|---|
| `ranOn` | The day of the run: a day in the reproduction's `timeZone` (the zone the student started it from) when present, otherwise a UTC day. |
| `notebook` | `{file, sha256}`: the notebook that was run. When a project holds several, it is the first `.ipynb` by name. |
| `inputs[]` | `{file, sha256}`: every other file on record at the time, written beside the notebook. |
| `outputs.submitted` | The outputs digest (§4.3.3) of the outputs saved in the notebook file. |
| `outputs.ran` | The outputs digest of the outputs the run produced. |
| `cells` | `{code, differing, failedAt, differingAt?}`: the number of code cells, how many differed, the first cell that raised (or null), and which cells differed. |
| `environment` | Where it ran, in words. Today: `a fresh E2B code-interpreter sandbox (Python 3)`. |
| `network` | `none`: the sandbox had no internet, so the files were all the notebook had. `open`: it had internet. |
| `runtime` | `{python, packages[{name, version}], imported?}`: the interpreter and the scientific packages in the sandbox, and which of them the notebook imports. |
| `canon` | `2`: the notebook's own outputs were read by rule 2 (§4.3.2). Absent: by rule 1, as on every reproduction made before v1.1. |

**How Wizzad makes the run.**

* It opens a new sandbox for each run, never one that has seen the student's machine.
* It writes every file on record into one directory, then runs the code cells in order, in one kernel, from that directory.
* Each cell may take 120 seconds, and the whole notebook 10 minutes. A run over the limit is not recorded.
* The run stops at the first cell that raises.
* The same files are never run twice. A kept reproduction of exactly these files stands until a file changes.

**Only Python notebooks are run.** The notebook's language is the first of `metadata.language_info.name`, `metadata.kernelspec.language` and `metadata.kernelspec.name` that the file gives, lowercased and trimmed. It counts as Python when it is empty, or begins with `python`, `ipykernel`, or `py` followed by a digit. A notebook in any other language is not run, and its record says nothing about a re-run.

#### 4.3.2 What a cell produced, in canonical form

The comparison and both digests use one canonical form of a cell's outputs, chosen so that the same notebook gives the same text everywhere.

**The code cells.** Take the file's `cells` in order. A cell is a *code cell* when its `cell_type` is `"code"` and its `source` is not blank (joined first, if it is an array of strings). Code cells are numbered `n = 1, 2, 3…` in file order. These are the numbers the record uses for "code cell n"; a notebook viewer's execution counts are not.

**tidy(s):**

1. Replace every `\r\n`, and every lone `\r`, with `\n`.
2. Remove spaces and tabs at the end of every line.
3. Remove every `\n` at the end of the text.

**The outputs saved in the file.** A notebook file keeps a cell's outputs in the order the cell produced them. A run's report does not: the sandbox reports what a cell printed apart from what it displayed. So the file is read by one of two rules, and the reproduction says which (`canon`, §4.3.1). Read a record by the rule it names.

**Rule 2** (`canon: 2`; every reproduction made since v1.1). The file is read the way a run is reported. For each code cell:

* **Printed text first.** Take the `text` of every `stream` not named `stderr`, in order (each joined, if it is an array), and concatenate them. Cut the result if it is longer than 65,536 UTF-16 code units (to its first 65,536, followed by `\n…[output cut at 65536 characters]`), then tidy it. If it is not empty, keep `{kind: "stdout", text}` as the cell's first output.
* **Then each `execute_result` and `display_data`, in order**, read as under rule 1 below (the figure rule and the `text/plain` rule); each text is tidied and not cut.
* **Then the error**, if the file has one for the cell: `{kind: "error", name: ename, value: evalue}`, a missing field becoming the empty string.
* A `stream` named `stderr` is ignored, as under rule 1.

A cell that displays something and then prints, or prints on both sides of a display, reads the same as a run of it. What rule 2 does not see is the order between a cell's printed text and what it displays; each is still compared in full. A rule 1 reproduction whose status is `reproduced` gives the same `outputs.submitted` under rule 2: every cell already had a run's shape.

**Rule 1** (no `canon`; every reproduction made before v1.1). For each code cell, take its `outputs` in order:

* **A `stream` named `stderr`:** ignored. Warnings vary with the machine and the package versions, and a result is what the cell shows.
* **Any other `stream`:** take its `text`, joined if it is an array. If the previous kept output is `stdout`, append the text to it; otherwise keep `{kind: "stdout", text}`. The output is kept even when its text is empty after tidying.
* **`execute_result` or `display_data`:** the kind is `result` for `execute_result` and `display` for `display_data`.
  * If the output's `data` holds a non-empty string under `image/png`, `image/jpeg` or `image/svg+xml`, it is a **figure**, and the whole output is ignored, text included.
  * Otherwise, if `data` holds `text/plain`, keep `{kind, mime: "text/plain", text}`. The text is the value joined if it is an array, or `JSON.stringify` of it if it is neither a string nor an array.
  * Every other MIME type is ignored.
* **`error`:** keep `{kind: "error", name: ename, value: evalue}`. A missing field becomes the empty string.

Then tidy every `text`. Then, as Wizzad computes it, cut any `text` longer than 65,536 UTF-16 code units to its first 65,536, followed by `\n…[output cut at 65536 characters]`.

Under rule 1, a cell that displays before it prints reads as differing from any run of it, even when nothing changed: the reason for rule 2.

**The outputs of a run.** For each cell that ran, keep, in this order:

* **`stdout`:** everything the cell printed to standard output, concatenated; cut as above if longer than 65,536 UTF-16 code units; then tidied. It is kept only if it is not empty.
* **Each rich result, in order:** kind `result` if it is the cell's main result (the value of its last expression), otherwise `display`. The same figure rule and `text/plain` rule apply.
* **An error, if the cell raised:** `{kind: "error", name, value}`, where `name` is the exception's class name and `value` its message.

Figures are never compared. A renderer on another machine never draws the same pixels, and the sandbox captures every open figure as an image even when the notebook only saved it to a file. What is compared is what the cells print and return.

#### 4.3.3 The outputs digest

1. For each kept output, sort its keys by code point and turn every value into a string.
2. For each cell, write one line: the JSON text of `{"n": n, "outputs": [ … ]}`, with `n` first, exactly as ECMAScript `JSON.stringify` produces it (no whitespace).
3. Join the lines with `\n`, with none after the last.
4. The **outputs digest** is SHA-256, lowercase hex, over the UTF-8 bytes of that text.

Which cells each digest covers, and how the two are compared:

* `outputs.submitted` covers every code cell, read by the reproduction's rule. A cell with nothing kept is written `{"n":3,"outputs":[]}`.
* `outputs.ran` covers the cells that ran.
* A cell *differs* when its line in the two texts is not identical.
* `failedAt` is the first cell that ran with an `error` output. The status follows from these (§4.3.1).
* When the status is `reproduced`, `outputs.ran` equals `outputs.submitted`. A reader can check this from the record alone.

**Test vector.** This package includes the notebook `test/fixtures/reproduction/example.ipynb` (SHA-256 `4e2180c9d73f2a72028cd84613b32c05ca141146d38f3a8290eaccb50745003b`). The canonical text of its submitted outputs is:

```
{"n":1,"outputs":[]}
{"n":2,"outputs":[{"kind":"stdout","text":"rows: 120\nsites: 6"}]}
{"n":3,"outputs":[{"kind":"result","mime":"text/plain","text":"0.8134"}]}
{"n":4,"outputs":[]}
{"n":5,"outputs":[{"kind":"error","name":"KeyError","value":"'depth'"}]}
```

and its digest is `a0838555f1b767787543d1e1aac0ff104b16e2c42c564cbe6be5d9a58e28a325`, under both rules: every cell already has a run's shape. The example exercises each reading rule:

* The markdown cell and the blank code cell are not code cells.
* The stderr warning is ignored.
* The two stdout chunks merge, and their trailing spaces go.
* The HTML beside the plain text is ignored.
* The figure is ignored whole.
* The error is kept.

**Second test vector.** The notebook `test/fixtures/reproduction/interleaved.ipynb` (SHA-256 `2ab2e71c2c4c61689ec04432f4abaa918d134fd72ff7870d9b0857d36af1c97b`), executed by Jupyter, has a cell that displays and then prints, and one that prints on both sides of a display. Under rule 2, the canonical text of its submitted outputs is:

```
{"n":1,"outputs":[{"kind":"stdout","text":"a"},{"kind":"display","mime":"text/plain","text":"{'k': 1}"}]}
{"n":2,"outputs":[{"kind":"stdout","text":"a"},{"kind":"display","mime":"text/plain","text":"{'k': 1}"}]}
{"n":3,"outputs":[{"kind":"stdout","text":"before\nafter"},{"kind":"display","mime":"text/plain","text":"{'k': 2}"}]}
{"n":4,"outputs":[{"kind":"stdout","text":"n = 3"},{"kind":"result","mime":"text/plain","text":"{'k': 3}"}]}
```

and its digest is `f27c55199703cef5a3d5be7531f06b701cabe7a2d1e8ca6e67b83e8a91fbf1bb`. Under rule 1, it is:

```
{"n":1,"outputs":[{"kind":"stdout","text":"a"},{"kind":"display","mime":"text/plain","text":"{'k': 1}"}]}
{"n":2,"outputs":[{"kind":"display","mime":"text/plain","text":"{'k': 1}"},{"kind":"stdout","text":"a"}]}
{"n":3,"outputs":[{"kind":"stdout","text":"before"},{"kind":"display","mime":"text/plain","text":"{'k': 2}"},{"kind":"stdout","text":"after"}]}
{"n":4,"outputs":[{"kind":"stdout","text":"n = 3"},{"kind":"result","mime":"text/plain","text":"{'k': 3}"}]}
```

and its digest is `eb1d3174608fe9d8f03de9a1cb332ecf2a51c3d868e0d9c75ef48d30263bdf90`. Cells 2 and 3 are the difference: under rule 1 they would read as differing from any run of this notebook.

#### 4.3.4 Checking a reproduction yourself

1. **The files.** Hash the notebook and each input. The hashes must equal `reproduction.notebook.sha256` and `reproduction.inputs[].sha256`, and each must appear among the deliverables.
2. **The submitted outputs.** Compute `outputs.submitted` from the notebook file alone, by the rule the reproduction names (§4.3.2–4.3.3); nothing runs. A match means the record's comparison was made against this file's own outputs.
3. **The run.**
   * Put the notebook and its inputs in one directory.
   * Run the code cells in order, in one Python kernel, from that directory, with no network. Use `runtime.python` and the versions in `runtime.packages` where you can.
   * Canonicalise what came out, and compare it with the submitted outputs, cell by cell.
   * When the notebook is deterministic and your environment matches, your digest will equal `outputs.ran`.
   * A cell that differs in your run and not in Wizzad's, or the other way round, is where to look: a random draw with no seed, a clock, a package version.

`wizzad-record reproduce <notebook.ipynb> <link>` does steps 1 and 2. With `--run`, it also does step 3 in a fresh Jupyter kernel on your machine and compares the result cell by cell. `--run` executes the notebook's code with your permissions and your network, so use it where you would run a stranger's code.

A run in a different environment, such as Python compiled to WebAssembly in a browser, is still a real check of the code and the data. An output that differs there, however, may be the environment's doing rather than the student's.

A re-run shows that the files on record produce these outputs on a machine that never saw the student's. It does not show who wrote the notebook, whether the data were collected as described, or anything about work done away from the computer.

#### 4.3.5 The model run

When a spreadsheet model is handed in, `project.model` records Wizzad recalculating it: every formula evaluated again and set against the value saved in the file.

| Field | Meaning |
|---|---|
| `file`, `sha256`, `ranOn` | The workbook, by fingerprint, and the day of the run: a day in the model run's `timeZone` when present, otherwise a UTC day. |
| `formulas` | The number of formulas in the workbook. |
| `evaluated`, `matched`, `differing` | How many formulas Wizzad evaluated *and* set against a saved value, and how many of those matched or differed. A proper spreadsheet error such as `#DIV/0!` counts as a value. |
| `unsupported[]` | Functions Wizzad's evaluator does not evaluate, by name. |
| `circular` | Formulas in, or reading, a circular reference. |
| `beyond` | Formulas beyond the evaluator's limits. |
| `unsaved` | Formulas the file carried no saved value for, as happens with a file saved by a tool that does not calculate. |
| `outputs[]` | Up to 30 of the model's outputs, as `{label, value, cell}`: the label as the sheet gives it, the value as a student reads it, and the cell as `Sheet!A1`. |

The counts rest on Wizzad's evaluator. The outputs do not: they are values in a file the reader can hold. To check them, open the workbook (its fingerprint must match), recalculate it in any spreadsheet program, and read the named cells.

### 4.4 Part IV: the defense

The defense is a timed session about the piece. The student answers one question at a time, with 90 seconds for each and 15 minutes in all — or 1.5 or 2 times that where the student chose more time before the first question (v1.8), as a student with extended time in tests would. The piece is out of sight, except for the short excerpts the questions quote. Its counts are **Wizzad's grading, signed**.

**`results`**:

| Fields | What they count |
|---|---|
| `checked`, `checkedCorrect` | Questions with a set answer, compared automatically with it; no AI judges the student’s answer. For most the set answer is taken from the piece; for a what-if question it was worked out by the AI from the piece’s own reasoning when the question was written, and is not checked against the piece. |
| `explained`, `explainedFull`, `explainedPartial` | Reasoning in the student's own words, graded by an AI grader against a marking guide written from the piece. |
| `episodic`, `episodicAccounted` | Changes from the piece's own saved history that the student was asked to account for. |
| `history`, `historyConnected` | Things the student studied that the piece names. |
| `ungraded`, `late`, `skipped` | Answers not graded, answers that arrived after their window, and questions with no answer. |

**`rescore`** = `{agreed, of}`: how often a second AI grader agreed with the first, across the AI-graded answers.

**`council`** (v1.8) = `{graders, of, unanimousBlind, conferred, unanimousAfter}`: the AI graders that read the explanations — two, or three where the deployment holds a third from another company — each blind to the others' grades. `of` counts the answers at least two graders read; `unanimousBlind` those on which every grader gave the same credit class without sight of another; `conferred` those on which the graders, having differed, were each shown the others' scores and reasons once and asked to reconsider; `unanimousAfter` those unanimous after that round. The grade of record on such an answer is the median of the final scores when three graders answered, the first grader's final score when two. Absent on a sitting sealed before v1.8, and where no answer was read by two graders; a record with it still carries `rescore`, which then counts the first two graders' agreement. The graders are named in the signed payload's `grading.explained` (`model`, `rescoreModel`, and `thirdModel` where one read an answer).

**`timing.minutes`** and **`telemetry`** = `{windowLeft, pasted}`: counted during the session. They change no result; they are reported for the reader to weigh.

**`timing.allowed`** (v1.8) = `{perItemSec, minutes}`: the time the sitting allowed — seconds a question and minutes in all — stated on every sitting alike, whatever it was. A record never says why a sitting allowed more time, and a verifier must not present a longer time as a finding about the student.

**`askedBefore`** (v1.8): how many of this sitting's questions — the same words about the same passage — had been put to the student in an earlier sitting on the piece, practice included. Every set is made to avoid what was asked before, so this is 0; it is counted at the seal and signed so that a reader need not take that on trust. Absent on practice, and on a sitting sealed before v1.8, when a sitting after practice was asked practice's own questions.

**`manner`** (v1.8): how the questions were answered — `typed`, `spoken` (aloud, written down by software) or `examiner` (aloud, to the AI examiner). Each counts the same. Absent on a sitting sealed before v1.8.

**`project.covered`**: what the questions were drawn from. These count questions asked, never answers.

* `brief` and `pages`: the number of questions drawn from each.
* `files[{file, questions, cells}]`: the questions drawn from each file, with the notebook cells asked about.
* `cross[{a, b, questions}]`: questions that set a claim in one part against the place in another part that computes it.
* `opened`: questions asked with a notebook cell open in front of the student.

**`project.liveRuns[]`** = `{cell, code, output, raised}`: runs the student made of an opened cell during the defense. `code` is SHA-256 over the UTF-8 code as run, and `output` is SHA-256 over the UTF-8 output as kept. A live run is an aid to the answer, never the answer.

**`spoken`** = `{answers, of, onsetMedianSec, onsetSpreadSec, examiner?}`: answers given aloud, written down, and graded as the same words typed would be. `examiner` counts answers given to the AI examiner, when the student chose one. The examiner reads the questions and listens; it does not grade, help, or ask a question of its own.

The answers themselves are not in the record. A student can make a link that includes them, and a reader can then recount the results, for example without the AI-graded ones.

**The recording.** When the student chose to record the session, `capture` seals the files by fingerprint:

* `camera` and `screen` = `{sha256, bytes, mime, seconds}`, where the fingerprint is over the exact bytes of the whole recorded file.
* `clips[]` = `{itemId, sha256, bytes, mime, seconds}`: one clip per spoken answer. `answerClips` is their count.

A reader can watch a recording only through a link the student made with the recording included, at `https://<host>/api/proof/shared/<token>/recording/<defenseId>?stream=camera|screen`.

* Wizzad serves a file only when the copy it holds carries the sealed fingerprint.
* When Wizzad no longer holds the file, the fingerprint stays in the record, and any copy the student kept can still be checked against it: download it and hash it (§8).
* Wizzad does not analyse recordings: no face, gaze or room check.
* A recording cannot show what was outside the frame.

#### 4.4.1 A sitting with a host in the room

A sitting may be sat with a **host** in the same room, who checks in person who is sitting, watches the whole sitting, and afterwards gives their word on what they saw — with their own passkey, or through Wizzad (§4.4.2). Nothing about the sitting itself changes — the same clock, the same grading, the same seal by the student's platform — and the questions are ones the student has not been asked on the piece before. A host is one of two kinds:

* **A host Wizzad admitted** — an account Wizzad has admitted to hosting, holding a confirmed school email address. This is every host before v1.6, and every sitting without `readerHosted` or `school`.
* **A host a school admitted** (v1.9) — an account the school's own admins admitted, by its address at the school's domain, holding that address as a confirmed school email. The school is a domain that came to be a school on Wizzad one of two ways: a person at Wizzad checked it is one and approved it, under a name (`approvedBy: 'wizzad'`); or its domain's owner published a DNS record Wizzad gave them (`approvedBy: 'dns'`) — which shows who controls the domain, not that it is a school. Such a sitting carries `school`, and counts toward a standing as a host Wizzad admitted does (§4.6).
* **A reader who hosts** (v1.6) — a reader of the student's record who asked, through the record's link, for this sitting and hosts it themselves, in a window only that student could check in to, for that piece only. Their address was confirmed by a link Wizzad mailed to it, opened by the account that uses that address; nothing else about them is checked. Such a sitting carries `readerHosted: true`, and it never counts toward a standing (§4.6).

**`condition`** = `'supervised'` on such a sitting. Absent on every other sitting, and on every record issued before this version: read absent as *sat alone*, never as *unsupervised* in any stronger sense.

**`supervised`** — the host's window, as the platform read it when the sitting sealed:

| Field | Meaning |
|---|---|
| `windowId` | The host's sitting window the student checked in to. |
| `place`, `startsAt`, `endsAt` | Where and when the window was, as the host set it. Absent when it could not be read at the seal. |
| `materials`, `device` | The window's rules as the host set them: `closed_book`, `open_book` or `own_notes`; `own` (the student's device) or `provided` (the host's). Absent as above. |
| `recording` (v1.4) | What the window recorded, as the host set it: `none`, `camera`, or `camera_screen`. The **rule**; what the sitting in fact carries is the defense's own `capture` block (§4.4), and a reader sets the two side by side — *the window required camera and screen; this sitting carries the camera only* is an honest record, not a broken one. Absent on windows opened before v1.4, and read as `none`. |
| `host` = `{name, organisation, domain}` | The host's name and organisation **as the host entered them**, unchecked; `domain` is the domain of a school email address the host confirmed with Wizzad — or, where `readerHosted`, of the address the reader asked from, which a link Wizzad mailed there and the reader opened, signed in, confirmed. |
| `readerHosted` (v1.6) | `true` when the host is a reader of the student's record who asked for this sitting through the record's link, in a window opened for it (only that student, only that piece, could check in). Absent otherwise, and on every sitting before v1.6: read absent as a host Wizzad admitted. |
| `school` = `{name, domain, approvedBy}` (v1.9) | The school that admitted the host, as it stood when the window was opened: `name` as the school was approved — by a person at Wizzad where `approvedBy` is `'wizzad'`, or as the domain's owner gave it where `approvedBy` is `'dns'`; `domain`, the school's domain, which is the host's `domain` too. The host's `organisation` is then the school's name, not one the host entered. Absent for a host Wizzad admitted itself, for a reader who hosts, and on every sitting before v1.9. |
| `identityConfirmed` | Whether the host had confirmed, in person and before the sitting began, who was sitting. |
| `attestation` | The host's own signed word — below. Absent until given: the record is then **awaiting the host's word**, and says so. |

**`supervised.attestation`** — the host's word, made by the host's passkey and checkable by anyone:

* `statement`: what the host signed, as canonical JSON (§5.1). `schema` is `wizzad.host-word/v1`. It names the student's sealed record (`recordId`, `sealedAt`, `payloadSha256` = SHA-256 over the canonical JSON of that record's payload), the check-in and window (`checkinId`, `windowId`), the piece (`piece.title`, `piece.attempt`), the host as above, `watched: 'whole'` — *I watched this sitting from start to finish* — `exceptions[]` drawn from `left_room`, `other_device`, `technical_fault`, a `note` (the host's own words, or null), `signedAt`, and — since v1.4, on words given where the field exists — `recording`, the window's rule as above: where both the statement and `supervised` carry it, they agree (step 6).
* `challenge`: base64url(SHA-256(canonical JSON of `statement`)). This is the WebAuthn challenge the host's authenticator signed, so the signature is over the statement and nothing else.
* `assertion` = `{credentialId, clientDataJSON, authenticatorData, signature}`: the WebAuthn assertion, base64url, exactly as the authenticator returned it.
* `key` = `{spki, alg, keyId}`: the host's passkey public key as SubjectPublicKeyInfo (base64), its algorithm (`ES256`, `RS256` or `EdDSA`), and its id — the first 16 hex characters of the SHA-256 over the SPKI, the same rule as §6.
* `rpId`, `origin`: the relying-party id and origin the assertion was made for.

**Checking a host's word** (`wizzad-record` does this in `src/host.js`, with Node's `crypto` and nothing else):

1. `challenge` equals base64url(SHA-256(canonical JSON of `statement`)).
2. `clientDataJSON` decodes to `{type: 'webauthn.get', challenge, origin}` with that challenge and the attestation's `origin`, whose host is `rpId` or a subdomain of it.
3. `authenticatorData` is at least 37 bytes; its first 32 are SHA-256(`rpId`); its flags byte has *user present* (bit 0) and *user verified* (bit 2) set.
4. `key.keyId` is the first 16 hex of SHA-256(`key.spki`).
5. The signature holds under the key over `authenticatorData ‖ SHA-256(clientDataJSON)` — ECDSA P-256 with SHA-256 (DER signature) for `ES256`, RSASSA-PKCS1-v1_5 with SHA-256 for `RS256`, Ed25519 for `EdDSA`.
6. The statement names the sitting it sits beside: `statement.recordId` is the defense's `id`, `statement.windowId` is `supervised.windowId`, `statement.piece.attempt` is the defense's `attempt`, and `statement.host.domain` is `supervised.host.domain`; and where both carry `recording` (v1.4), `statement.recording` is `supervised.recording`.

*Valid* here means: **the holder of that passkey signed those words about that sitting.** It does not say who the holder is. The platform admitted the account to hosting after confirming a school address at `domain`; the name and organisation are the host's own entry. The attestation is carried inside the record's payload, so the record's signature (§5) covers the copy the platform kept; the host's signature is the host's own and is checked separately. A record whose sitting was `supervised` but carries no `attestation` is awaiting the host's word — not a failed check, and not a sitting sat alone.

#### 4.4.2 A word given through Wizzad

The passkey is the default and the stronger form. A host may instead give the same word **through Wizzad**, in one of two ways, and the record says which:

* **`method: 'account'`** — the host, signed in to their Wizzad account, read the statement and confirmed it.
* **`method: 'email'`** — Wizzad sent a one-time link to the school address the host had confirmed; the host opened it, signed in, and confirmed the statement. `email` = `{domain, confirmedAt}` names the address's domain and when the link was opened.

In both, **`supervised.attestation`** is:

| Field | Meaning |
|---|---|
| `method` | `'account'` or `'email'`. A passkey word carries no `method`. |
| `statement` | The same statement as §4.4.1, canonical JSON (§5.1). |
| `signedBy` = `{algorithm, keyId, signature}` | **Wizzad's** Ed25519 signature over the UTF-8 bytes of the canonical form of `statement` — the record's own key and rule (§5.2), `signature` base64url. |
| `email` | `method: 'email'` only: `{domain, confirmedAt}`. |

**Checking it:** find `signedBy.keyId` among the published keys (§6) — refuse a revoked or absent key — and verify the Ed25519 signature over the canonical form of `statement`; then bind the statement to the sitting as in §4.4.1 step 6.

*Valid* here means: **Wizzad signed these words, and says the host gave them that way.** It is Wizzad's word, not the host's own key — the same trust as the record itself, and no more. A verifier must print which form it checked, and never call a word given through Wizzad the host's own signature.

#### 4.4.3 A person's review

Questions are made by an AI, and explanations are graded by AIs (§4.4). A student may ask for a person to review a sitting: once per sitting. The reviewer — a person Wizzad names — reads the questions, the answers and the grades, and either leaves the result as it is, regrades answers, or sets the sitting aside. A sealed sitting is never edited; the decision is its own note, and a review that **changed something** is carried on the defense it is of, as **`review`** (v1.7):

| Field | Meaning |
|---|---|
| `outcome` | `'corrected'` — the person regraded one or more answers; or `'set_aside'` — the sitting had a fault in how it was asked, heard or arranged. |
| `decidedAt` | When it was decided (an instant, UTC). |
| `reviewer` = `{name, role}` | The person who decided, **as Wizzad entered them**. |
| `about` | What the student asked the review about: `grade`, `question`, `heard` (how an answer was written down), `arrangement` (one the student was due), `status` or `other`. |
| `regraded` | `corrected` only: how many answers the person regraded. |
| `resultsAsSealed` | `corrected` only: the `results` the sealed sitting counted. |

* **`corrected`:** the defense's `results` are **as counted after the review** — the same counting (§4.4) over the regraded answers — and `resultsAsSealed` keeps what the seal counted. A person may regrade an answer to right, partly right (an explanation only), not right, or ungraded (the question could not fairly be graded: counted neither way).
* **`set_aside`:** the defense is carried exactly as it was sealed, and **counts toward nothing**: no standing pools it (§4.6). The student may sit the piece again at once.
* **A review that left the result as it was is not carried.** Neither are the student's words or the reviewer's reply: those are between the two of them.

The review is inside the signed payload, so it is covered by the record's signature (§5): it is **Wizzad's word that the person it names decided this** — the same trust as the record itself, and no more. A record issued before a review was decided does not carry it and is not changed by it; a record issued afterwards does.

**Checking a review** (`wizzad-record` does this in `src/review.js`): `outcome` is one of the two; `reviewer` names a person and a role; `decidedAt` is an instant; a `corrected` review says how many answers were regraded and keeps `resultsAsSealed`. *Valid* here means: **the record carries a well-formed review.** It does not say the review was right. A review is only as good as the signature over the record that carries it: where the record does not verify, a verifier must say the review is not a signed word, and `wizzad-record` does.

#### 4.4.4 One word for the room

A host who watched several sittings in one window may give **one word for all of them** (v1.10): one passkey ceremony, or one confirmation through their account (§4.4.2), covering every sitting they name, each with its own exceptions and note. Each student's record carries that word as its `supervised.attestation`, with two things: the **room** — what the host signed — and **its own sitting's statement**. The other sittings appear only as hashes, which say nothing about them.

**`attestation.room`** (v1.10) — canonical JSON (§5.1):

| Field | Meaning |
|---|---|
| `schema` | `wizzad.host-room-word/v1`. |
| `windowId`, `host`, `watched`, `recording`, `signedAt` | What every sitting in the room shares, exactly as each sitting's statement carries it (§4.4.1): the window, the host, `watched: 'whole'`, the window's recording rule where the statement has one, and the time the word was given. |
| `entries[]` | One per sitting the word covers, in the order signed — at least 1, at most 60, no two alike: base64url(SHA-256(canonical JSON of the sitting's **entry**)), where the entry is `{recordId, sealedAt, payloadSha256, checkinId, piece, exceptions, note}` taken from that sitting's statement. |

The attestation is otherwise as §4.4.1 or §4.4.2, except for what was signed:

* **By passkey:** `challenge` is base64url(SHA-256(canonical JSON of `room`)) — the room, not the statement.
* **Through Wizzad:** `method` is `'account'`, and `signedBy.signature` is over the canonical form of `room`. A word sent by a link to the school address (`method: 'email'`) never carries a room.

**Checking a word for the room** (`wizzad-record` does this in `src/host.js`):

1. `room` has the shape above.
2. The statement agrees with the room: the same `windowId`, the same `host` (`name`, `organisation` — a string or null — and `domain`), `watched`, `recording` (both absent, or equal) and `signedAt`; and it carries no other field. It is exactly `schema`, its entry's fields and these: a field outside them is covered by no signature, so a statement that carries one is not the room's.
3. base64url(SHA-256(canonical JSON of the statement's entry)) is one of `room.entries`.
4. The signature: by passkey, steps 1–5 of §4.4.1 with `room` in place of `statement` in step 1; through Wizzad, the check of §4.4.2 over the canonical form of `room`.
5. The statement names the sitting it sits beside: §4.4.1 step 6.

*Valid* here means what it means for a word on one sitting — **the holder of that passkey (or, through Wizzad, Wizzad) signed those words about that sitting** — and that the same signature covered the other sittings the room counts. It says nothing about those sittings beyond their number: a verifier may say how many the room held, and nothing else about them.

### 4.5 Part V: the record

The parts above are fields of one payload, signed as a whole (§5). A task a reader set, and the student defended, is also issued as an Open Badges 3.0 credential (§7). The record is the student's to issue and to withdraw. A withdrawn or expired link stops serving the record; it never changes what was signed.

### 4.6 The standing

A record may carry, for each piece among its defenses, a **standing** (`record.standings[]`, v1.5): what the supervised sittings on that piece found, with its counted remote sittings beside them as context. It never says why a gap exists. It speaks for the defenses this record carries — a record covers a window (`windowDays`), so a supervised sitting on the piece outside it is not among them.

| Field | Meaning |
|---|---|
| `title` | The piece, as its newest named defense titles it. A piece renamed between sittings is still one piece: its older sittings may carry an earlier title. |
| `defenses` | The places in `record.defenses` of the piece's sittings in this record: its remote attempts and its supervised ones, counting or not. |
| `status` | `not_yet_verified`, `verified`, `awaiting_review` (v1.11), `more_evidence` or `not_verified`, as the student is shown it (below). |
| `supervised`, `remote` | `{credit, n, sittings}` pooled from the sittings of that condition that count, or `null` when none does. |
| `minimum` | (v1.11) The share of credit the supervised pool must reach for `verified`: `0.5`, the only value this version allows. Absent on a standing made before v1.11, which is read by the rules then (no minimum, and no `awaiting_review`). |

**A sitting's score** is its share of question credit. From a defense's `results`: `credit` = `checkedCorrect` + `explainedFull` + ½·`explainedPartial` + `episodicAccounted` + `historyConnected`; `n` = `checked` + `explained` + `episodic` + `history` + `late` + `skipped` (a late or skipped question was asked and earned nothing; `ungraded` is left out). A sitting with `n` = 0 is left out of the standing. Sittings of one condition are pooled by adding `credit` and `n`. The standard error of a pooled share is √(p̃(1−p̃)/n) with p̃ = (credit + ½)/(n + 1).

**Which supervised sittings count:** a defense with `condition: 'supervised'` whose host's word is present and holds (§4.4.1, §4.4.2), whose `statement.exceptions` names neither `left_room` nor `other_device`, and — since v1.6 — whose `supervised.readerHosted` is not `true`. `technical_fault` does not stop it counting. A sitting a reader hosted is named among the standing's `defenses` like any other, and counts in neither pool: anyone may ask from an address they hold, so only a host Wizzad admitted moves a standing.

**A sitting a person's review changed** (v1.7, §4.4.3): a defense whose `review.outcome` is `set_aside` is named among the standing's `defenses` like any other and counts in **neither** pool, whatever its condition; one whose `review.outcome` is `corrected` counts by the `results` the record carries, which are as counted after the review.

**The gap** is the remote share minus the supervised share, adjusted for the practice gain whichever condition was sat **second** gets anyway — 0.06 of credit added when the supervised sittings came second, subtracted when the remote ones did — and divided by √(SEᵣ² + SEₛ²). Which came second is read from the first sitting of each condition in the order of `record.defenses`, which lists attempts **newest first**; the record carries each attempt's day, never its time (§4.4). The practice gain is a prior from retest studies, to be replaced by a measured one; a change to it is a version of this document.

**The status the rules give:**

| Status | When |
|---|---|
| `not_yet_verified` | No supervised sitting counts; or (v1.11, where the standing carries `minimum`) the supervised pool's share is below it. No gap is read then. |
| `verified` | At least one counts, (v1.11) its pool reaches `minimum`, and either no remote sitting counts or the gap is at or below 2.3 (one supervised sitting counts) or 3.1 (two or more). |
| `more_evidence` | Exactly one counts, and the gap is above 2.3. |
| `not_verified` | Two or more count, and the gap is above 3.1. |

A supervised result under the minimum is still on the record: its pool is carried, and so is the latest sitting's host. It does not stand as a supervised sitting on record yet, and says nothing about the remote sittings.

**The minimum** (v1.11) is a line Wizzad chose — half, the band's own lower line — not one set from data, and it carries no allowance for measurement error: on one ten-question sitting, a student who would earn six in ten over many sittings falls under it about one time in six. It is read from the pooled supervised sittings that count, so further sittings are added to it; the pools are always carried beside the status. A change to it is a version of this document.

**What the student is shown.** A gap status reaches a student only once a person at Wizzad has reviewed it. Until then the record carries `awaiting_review` (v1.11; before v1.11, `verified`). `awaiting_review` is the status when the record was issued: it is no finding, and a record issued after the review carries its outcome. A person who reviewed it may release the gap status, or the milder `more_evidence` in place of `not_verified`, or `verified` — they looked, and the supervised result stands. Such a `verified` (v1.11: carried where the rules give a gap) rests on Wizzad's word that a person looked, not on the rules; a verifier reads it so. Never a harsher status than the rules give, never `verified` where no supervised sitting counts or (v1.11) where its pool is under the minimum, and never `awaiting_review` where the rules give no gap. This withholds the *label*, not the numbers: the pools and the rules are here, so anyone can compute the gap. A verifier must not print a status the record does not carry, and `wizzad-record` prints the pools, not the gap.

**The band** (v1.8). Where at least three sittings count — the counted supervised ones and the remote ones together — a standing may be read with a band: the share of credit across all of them, `credit / n` over both pools, as *under half* (below 0.5), *between half and three quarters* (0.5 to below 0.75), or *three quarters or more*. Fewer than three sittings carry no band: one sitting's share is a small sample. The band is not a field: it is read from `supervised` and `remote`, so a verifier computes the same one.

**The words** (v1.11). A status is read through its label, never its code, and no label says *Verified*:

| Code | Label |
|---|---|
| `verified` | *Supervised sitting on record* — said with the host and day of the latest supervised sitting that counts, and the pooled score of all that count beside it |
| `not_yet_verified` | *Not yet confirmed* |
| `awaiting_review` | *Awaiting review* |
| `more_evidence` | *More evidence requested* |
| `not_verified` | *Not yet confirmed*, after two tries |

The codes keep their names because every record made before carries them. A standing made before v1.11 keeps the status it was issued with: its `verified` reads *Supervised sitting on record* — its supervised sitting is on the record — and where the v1.11 rules would read it otherwise (a pool under the minimum, or a gap no person reviewed), a reader must be told so beside it. A standing never says *cheating*, *suspicious* or *flagged*, and never names a finding.

**Checking a standing** (`wizzad-record` does this in `src/standing.js`):

1. Every place in `defenses` is a defense this record carries, named once, and `title` is the title of the newest of them (the lowest place). Where `minimum` is present it is `0.5` (v1.11); where it is absent, `status` is not `awaiting_review`.
2. Recompute `supervised` and `remote` from those defenses as above — a supervised sitting counting only when its host's word verifies, and a sitting set aside by a person's review counting in neither — and compare `credit`, `n` and `sittings`.
3. Compute the status the rules give — by `minimum` where the standing carries it — and the gap, and check the carried `status` is that status or one a review allows as above.

*Valid* here means: **this status is one the rules allow for these sittings.** It does not say how the student learned, nor anything the sittings do not show.

## 5. Signing

### 5.1 Canonical form

The signature covers the **canonical JSON** of `payload`: `JSON.stringify` of the payload with every object's keys sorted (by code point) at every depth, arrays kept in order, no whitespace, encoded as UTF-8. Re-serialising a record (pretty-printing it, re-ordering keys, moving it between systems) does not change what was signed. `src/canonical.js` is the whole algorithm, fifteen lines.

### 5.2 The signature

The signature is Ed25519 (RFC 8032, pure, no pre-hash) over the UTF-8 bytes of the canonical form. `signature` holds the 64-byte signature, base64url without padding. `algorithm` is always `"Ed25519"`.

### 5.3 Checking a record

1. Take `payload`, and compute its canonical form (§5.1).
2. Find the key named by `keyId` among the published keys (§6), and recompute the id from the key's bytes. Refuse if the key is absent or the id does not match.
3. Verify the Ed25519 signature over the canonical bytes.
4. Report *valid* only if steps 2 and 3 both pass. Report the key id, and the SHA-256 of the canonical form, so two people can compare what they checked.

`wizzad-record check <link>` does exactly this. `web/index.html` does it in a browser, with WebCrypto.

## 6. The keys

Wizzad publishes its public keys at `https://<host>/api/proof/keys`:

```json
{ "keys": [ { "keyId": "1b08271a2234fbce", "algorithm": "Ed25519", "publicKey": "<SPKI DER, base64>", "publicKeyPem": "-----BEGIN PUBLIC KEY-----…" } ], … }
```

* `keyId` is the first 16 hex characters of SHA-256 over the key's SPKI DER encoding. So an id can be recomputed from the bytes, and a document cannot claim an id its key does not have. A verifier **must** recompute it.
* The list carries the key that signs today **first**, then any retired keys. A retired key never signs again, but a record signed under it keeps verifying.
* A **revoked** key is different from a retired one: it may have left Wizzad's hands, so nothing signed with it can be relied on. It is never in `keys`; it is named, with the day from which it is revoked and why, in a `revoked` list beside them (`[{ keyId, revokedFrom, reason }]`). A checker refuses a record or credential naming a revoked key even when an older copy of the key documents still lists it. `2624cf0b6019071d` is revoked from 15 September 2026: the server holding it was compromised that day.
* A record naming a key that is not in the list cannot be checked. A verifier must say so rather than try another key.
* The same keys appear as Multikeys (`z6Mk…`, multicodec `0xed01` followed by 32 bytes) in the issuer's DID document (§7.3). The two publications hold the same keys; a verifier may use either.

## 7. The credential

A task a reader set, which the student finished and defended, is issued as an **Open Badges 3.0** credential: a W3C Verifiable Credential (Data Model 2.0). It is served at `https://<host>/api/proof/shared/<token>/tasks/<taskId>/credential`, with media type `application/ld+json`.

### 7.1 Shape

* **`@context`:** exactly `["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"]`. Both contexts are bundled in this package (`contexts/`), pinned by URL, and never fetched. A credential naming any other context is refused.
* **`type`:** `["VerifiableCredential", "OpenBadgeCredential"]`.
* **`id`:** `https://<host>/proof/credentials/<id>`, the credential's own address, where the same document can be fetched again.
* **`issuer`:** a `Profile` whose `id` is the issuer's DID (§7.3), with Wizzad's name and url, and a description that says what the credential is not: a grade, a verdict, or an identity check.
* **`credentialSubject.achievement`:** the task as set.
  * `achievementType: "Assignment"`, and `name`, which is the task's title.
  * `criteria.narrative`: the sitting rule, and how the making was recorded.
  * `resultDescription`: the defense's counts.
  * `result`, and a `narrative` in the record's own words.
* **`credentialSubject.identifier`:** two unhashed `IdentityObject`s. One is the record's id (`identityType: "identifier"`). The other is the name **as the student entered it** (`identityType: "name"`). Wizzad has not checked that name, and the record says so; a verifier must not read it as an identity check.
* **`validFrom`:** when the credential was issued.
* **`proof`:** a `DataIntegrityProof`, with `cryptosuite: "eddsa-rdfc-2022"`, `proofPurpose: "assertionMethod"`, `verificationMethod: "<issuer DID>#<keyId>"`, `created`, and `proofValue` (multibase base58-btc, a 64-byte Ed25519 signature).

### 7.2 Checking a credential (eddsa-rdfc-2022)

1. Remove `proof` from the document; the rest is the *unsecured document*. Remove `proofValue` from the proof; the rest is the *proof configuration*. Give the configuration the document's `@context`.
2. Canonicalise both with RDFC-1.0 (formerly URDNA2015) to N-Quads. Use *safe* mode, in which a term the contexts do not define is an error rather than being dropped. Resolve the two contexts from the bundle only.
3. Hash each canonical form with SHA-256. The bytes to verify are `sha256(configuration) ‖ sha256(document)`.
4. Take the fragment of `verificationMethod`, and look the key up as in §6, in the DID document or the keys list.
5. Verify the Ed25519 signature in `proofValue` over those bytes.

`wizzad-record credential credential.json --keys did.json` does exactly this. Step 2 needs the `jsonld` library, which is why the browser page does not check credentials.

### 7.3 The issuer's DID

The issuer is `did:web:<host>:proof:issuer`, which resolves (per did:web) to `https://<host>/proof/issuer/did.json`. That document lists every published key as a `Multikey` verification method, with id `<DID>#<keyId>`, usable for `assertionMethod`. The `keyId` fragment is the same id as in §6.

## 8. Files the record vouches for

A reader who holds a copy of a file hashes it (SHA-256 over its exact bytes) and looks for the same code in the payload. The file itself goes nowhere. A match means *this is the file the record was made from*. The record says nothing about a file it does not name.

| Where, in `record.defenses[i]` | What the fingerprint is over |
|---|---|
| `elsewhere.sha256` | The piece brought in: the file's bytes, or the tidied pasted text (§4.2). |
| `project.brief.sha256` | The brief's canonical text (§4.1). |
| `project.deliverables[j].sha256` | Each file handed in. |
| `project.reproduction.notebook.sha256`, `…inputs[j].sha256` | The notebook that was re-run, and the files beside it. |
| `project.reproduction.outputs.submitted`, `…outputs.ran` | The canonical outputs text (§4.3.3). This is not a file you would hold; recompute it instead. |
| `project.model.sha256` | The workbook that was recalculated. |
| `project.liveRuns[j].code`, `…output` | The code as run, and the output as kept, during the defense. |
| `project.entries[j].photo` | A lab-notebook photo, on older science records. |
| `capture.camera.sha256`, `capture.screen.sha256`, `capture.clips[j].sha256` | The recordings. |

A lab-notebook entry's own `sha256` (`project.entries[j].sha256`) is over its moment and its words. It is not a file, and it is not matched.

`wizzad-record file <path> <link>`, and the browser page's second step, do this matching.

## 9. Versioning

This is the Defended Work Standard **v1.11**. The payload's `schema` (`wizzad.proof/v1`) names the payload's shape; this document says what its fields mean and how each one is checked.

* **Fields are only ever added, as optional fields.** A record never loses a field it was issued with, and a reader must handle every shape ever signed. Read an absent field as §3.1 says.
* **Changes that bump the version.** A change to any of these will bump this document's version:
  * the canonicalisation;
  * the signature algorithm;
  * the key publication;
  * the credential's contexts or cryptosuite;
  * the canonical outputs of a reproduction (§4.3.2–4.3.3).

  A change is never applied to records already issued: what was signed stays checkable as it was signed.
* **What changed from v0.1.** v0.1 (20 September 2026) described the signing, the keys, the credential, and two of the file fingerprints. v1 adds:
  * the five parts;
  * the brief's canonical text;
  * the deliverables;
  * the reproduction's canonical outputs and digest;
  * the model run;
  * the defense's fields;
  * the full list of fingerprints.

  Nothing in v0.1 changed.
* **What changed in v1.1.** A second rule for reading a notebook's own outputs (§4.3.2), which reads a cell that displays before it prints the same as a run of it, and the reproduction's `canon` field, which names the rule. Reproductions made before v1.1 carry no `canon` and are read by rule 1; their digests are unchanged, and so is how a run is read.
* **Added within v1.1: time zones.** Optional `timeZone` fields on the record, each attempt, the brief, each deliverable, the reproduction and the model run (§3.1). They change no check: instants are UTC as before, and a record without them gives UTC days, as every record did.
* **What changed in v1.2.** A sitting sat with a host in the room (§4.4.1): the optional `condition` and `supervised` fields on a defense, and inside `supervised` the host's own signed word, `attestation` — a WebAuthn assertion over a canonical-JSON statement, carried with the host's public key so that anyone can check it. This adds a second signature to check, made by a second party's key; it changes nothing about the record's own signature, keys or canonical form. Records issued before v1.2 carry none of these fields and are read as sat alone.
* **Corrected within v1.5 (29 September 2026).** §4.6's check 1 first required every named defense to carry the standing's `title`, so a piece renamed between sittings failed a check it should pass. It now requires `title` to be the newest named defense's; the defenses are named once each. Records issued before the correction check as they should: the correction only accepts what the first wording wrongly refused.
* **What changed in v1.11.** A standing's status (§4.6): the optional `minimum` on a standing (`0.5`), below which a supervised result is on the record but `not_yet_verified`; the status `awaiting_review` in place of an unreviewed gap status, which a standing made before v1.11 carried as `verified`; a person's review may release `verified`. The labels people read change — *Supervised sitting on record*, *Not yet confirmed*, *Awaiting review* — and no label says *Verified*; the codes do not change. Nothing about any signature, key or canonical form changes, and a standing made before v1.11 (no `minimum`) is read by the rules then. A verifier older than wizzad-record 0.12.0 does not know these rules: it reports a v1.11 standing that carries `awaiting_review`, or `not_yet_verified` under the minimum, as NOT VALID — check a record made since v1.11 with 0.12.0 or later.
* **What changed in v1.10.** One word for the room (§4.4.4): the optional `attestation.room` — a statement over several sittings in one window that names each by the hash of its own entry — signed once by the host's passkey or, through the host's account, by Wizzad; each sitting's record carries the room and its own statement. A second shape of what a host's signature covers; nothing about the record's own signature, keys or canonical form changes, and words made before v1.10 carry no room and check exactly as they did.
* **What changed in v1.9.** A host a school admitted (§4.4.1): the optional `supervised.school` — the school's name, its domain, and `approvedBy` (`wizzad` or `dns`). Such a sitting counts toward a standing as any sitting with an admitted host does. Nothing about any signature, key or canonical form changes; records made before v1.9 carry no such field and check exactly as they did.
* **What changed in v1.8.** The council of AI graders (§4.4): the optional `council` on a defense, and `thirdModel` beside the graders' names. On a defense, the optional `timing.allowed` (the time the sitting allowed, which may now be 1.5 or 2 times the standard, chosen by the student) and `manner`. A verifier need compute nothing from it: it is a count the record carries, to be read as a statement of how often the graders agreed. Nothing about any signature, key or canonical form changes; records made before v1.8 carry no such field and check exactly as they did.
* **What changed in v1.7.** A person's review of a sitting (§4.4.3): the optional `review` on a defense, carried only when it changed something — `corrected` (the defense's `results` are as counted after a person regraded answers; `resultsAsSealed` keeps the seal's) or `set_aside` (the sitting is carried as sealed and counts toward nothing). A standing's pools and status are recomputed without a sitting set aside (§4.6). Nothing about any signature, key or canonical form changes; records made before v1.7 carry no such field and check exactly as they did.
* **What changed in v1.6.** A sitting a reader asked for and hosted (§4.4.1): the optional `supervised.readerHosted`, and the `host.domain` of such a sitting is the domain of the address the reader asked from. Such a sitting is sealed and signed as any other and its host's word is checked as any other, but it never counts toward a standing (§4.6): a standing's pools and status are recomputed without it. Nothing about any signature, key or canonical form changes; records made before v1.6 carry no such field and check exactly as they did.
* **What changed in v1.5.** Each piece's standing (§4.6): the optional `record.standings`, naming its sittings by their place in `defenses` with the credit it pooled and the status the student is shown, recomputable from the record alone. The order of `defenses` — newest first — is now part of what a verifier reads. Nothing about any signature, key or canonical form changes; records made before v1.5 carry no standings.
* **What changed in v1.4.** The window's recording rule (§4.4.1): an optional `supervised.recording` — `none`, `camera` or `camera_screen`, as the host set it — carried beside the defense's own `capture` block so that the rule and what was in fact kept can be read side by side; and the same optional field in the host's statement, bound to the record's in step 6. Nothing about any signature, key or canonical form changes; records and words made before v1.4 carry no such field and check exactly as they did.
* **What changed in v1.3.** A host's word may be given through Wizzad (§4.4.2): `attestation.method` of `'account'` or `'email'`, with `signedBy` — Wizzad's Ed25519 signature over the statement's canonical form under the record's own published keys — in place of the passkey assertion and key; `email` names the domain the link went to. A verifier checks such a word under the published keys and says it is Wizzad's word that the host gave it. Words given before v1.3 carry no `method` and check exactly as in v1.2.

## 10. What a verifier must not do

* Must not accept a key that is not among the published keys, whatever a record or a credential says about it.
* Must not treat `sharedAs`, `note`, or anything outside `payload` as signed.
* Must not fetch a JSON-LD context from the network to check a credential.
* Must not report *valid* on integrity alone when the key check failed.
* Must not read *valid* as a statement about who the student is, who made the piece, or whether AI was used.
* Must not read an absent field as zero, no, or false.
* Must not present `ran` as a failure. It means the notebook ran without error while some outputs differed, and the record names which cells.
* Must not present a reproduction as a statement about how the data were collected, or a science project's re-run as the bench work re-done.
* Must not present an unchecked name (`setBy`, a credential's `name` identifier, a setter's answer `name`, a claim answerer's `name` or `relation`) as checked.
* Must not present a host's word as Wizzad's, nor a host's `name` or `organisation` as checked: the word is the passkey holder's, and only the `domain` was confirmed (§4.4.1). Where the sitting carries `school` (v1.9), the organisation is the school's name: checked by a person at Wizzad when `approvedBy` is `'wizzad'`; the domain owner's own when it is `'dns'`, and not to be presented as checked.
* Must not read a word given for the room (§4.4.4) as saying anything about a sitting but the one its record carries: the room's other entries are hashes, and say only how many sittings the word covered.
* Must not present a sitting whose `supervised.readerHosted` is `true` as hosted at the student's school: its host is the reader who asked for it (§4.4.1).
* Must not read a `supervised` sitting without an `attestation` as failed, nor a sitting without `condition` as unsupervised in any sense stronger than *sat alone*.
* Must not count a sitting whose `review.outcome` is `set_aside` toward anything, nor present its results as evidence about the student; and must not present a reviewer's `name` or `role` as checked, nor a review as more than Wizzad's word that the person it names decided it (§4.4.3).
* Must not present a sitting's `timing.allowed`, where longer than the standard, as a finding about the student, nor guess why it was longer (§4.4).
* Must not present a standing's gap as a finding about the student, nor show a status a record does not carry: a gap is a reason to sit again (§4.6).
* Must not present `awaiting_review` as a finding, nor as a review still under way when the record is read: it is the status when the record was issued (§4.6). Must not present a `verified` carried where the rules give a gap as the rules' reading: it is Wizzad's word that a person looked.

The record's own words carry these limits. Keep them beside any result you show.
