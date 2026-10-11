# Data sources and licence decision

Verified 2026-10-11 from this machine.

## Decision

**Use CATS v2 (Controlled Anomalies Time Series), Zenodo record 8338435, CC BY 4.0.** SMD and NASA SMAP/MSL were rejected for lack of an explicit permissive data licence.

## Step 1: licence investigation

### SMD (OmniAnomaly, NetManAIOps): REJECTED, no dataset licence

- Repository README, line 83: "SMD (Server Machine Dataset) is a new 5-week-long dataset. We collected it from a large Internet company."
- The README names no company and states no dataset terms or redistribution permission. The repository `LICENSE` is MIT with copyright "NetManAIOps-OmniAnomaly" and covers the code; nothing says it covers the data folder.
- A web search for a dataset licence or terms found none (only licences of other NetManAIOps repos, which do not cover SMD). The KDD 2019 paper was not found to carry usage terms either.
- Conclusion: no stated right to publish results derived from a third party company's data. Not used.

### NASA SMAP/MSL (telemanom, Hundman et al.): REJECTED, terms not explicit

- Code licence: "Telemanom is distributed under Apache 2.0 license" (README). The repository `LICENSE.txt` opens: "Copyright Assertion. Copyright (c) 2018, California Institute of Technology ("Caltech"). U.S. Government sponsorship acknowledged. All rights reserved."
- Data: the README states no data terms. It tells users to fetch the data with `kaggle datasets download -d patrickfleith/nasa-anomaly-detection-dataset-smap-msl`. The Kaggle record's licence field reads "Data files © Original Authors". The direct S3 URL returns HTTP 403.
- "NASA data is public domain" cannot be assumed: JPL work is Caltech-copyrighted and the data host reserves rights. Not used.
- Structural reasons too: SMAP/MSL channels are largely univariate with one-hot commands, and there are no per-incident channel (interpretation) labels.

### CATS v2: ACCEPTED, explicit CC BY 4.0

- Record: https://zenodo.org/records/8338435 , DOI 10.5281/zenodo.8338435, version 2, published 2023-09-14, creator Patrick Fleith, Solenix Engineering GmbH. Zenodo licence field: `cc-by-4.0`.
- The dataset description document (`SLXENGDE-CATS-DDD`, v2), License section, verbatim: "This dataset description document and the CATS dataset were produced by Solenix Engineering GmbH, who kindly makes them available to the larger community under the Creative Commons Attribution 4.0 International license. To view a copy of this license, visit http://creativecommons.org/licenses/by/4.0/."
- **Footer contradiction, noted openly:** every page footer of that PDF reads "Commercial in Confidence, © Solenix Engineering GmbH". We rely on the explicit CC BY 4.0 grant in the same document's License section and on the Zenodo `cc-by-4.0` field. The footer is a template remnant of the document's first version dated 27/02/2023; if Solenix says otherwise the artifacts must be withdrawn.
- CC BY 4.0 permits sharing and adapting, including derived results, with attribution, a licence link, and an indication that changes were made. All three are carried in `meta.attribution` and must appear on the site.
- Nature of the data (from the description document): "commands, external stimuli, and telemetry readings of a simulated complex dynamical system with 200 injected anomalies", 17 variables, 5 million timestamps at 1 Hz, first 1 million rows nominal, "Contamination level of 0.038", signals "provided without noise", and the document itself calls it a "synthetic dataset".

## Files used

| File | Zenodo key | Bytes | MD5 (Zenodo) |
|---|---|---|---|
| data.parquet | data.parquet | 554,563,684 | 824309369c26902aa520e4b5209977f7 (verified after download) |
| metadata.csv | metadata.csv | 11,297 | cb52d1d73bf4bb54ebbfb466b94618de |
| CATS-DDD.pdf | SLXENGDE-CATS-DDD - Controlled Anomalies Time Series - 02.00.pdf | 228,485 | 30fee9cac0a83b8cd679b5e2f5dccf28 |

The 1.4 GB `data.csv` is not downloaded (same content as the parquet). `pipelines.ingestion.download` re-creates `data/raw/` from Zenodo, verifies each md5 against the record, and writes `data/manifests/raw_manifest.json` with sha256.

## Columns

- `aimp amud arnd asin1 asin2 adbr adfl` (7): the description document says 4 control commands and 3 external stimuli; its figure mapping each name to a role was not machine-readable here, so we group them as **context** and make no claim about which is which.
- `bed1 bed2 bfo1 bfo2 bso1 bso2 bso3 ced1 cfo1 cso1` (10): telemetry readings.
- `y` point label; `category` anomaly category id (0 = nominal, 1 to 13; the dataset gives no category names, so none are invented); `__index_level_0__` timestamp, 2023-01-01 00:00:00 to 2023-02-27 20:53:19, strictly 1 s steps.
- `metadata.csv`: per anomaly `start_time, end_time, root_cause, affected, category`. All 200 root causes are among the 7 `b*` channels; affected channels are among `ced1 cfo1 cso1`.
- Verified label convention: `end_time` is **exclusive** (a half-open `[start, end)` interval). Rebuilding `y` from the metadata with an exclusive end gives 0 mismatched rows; an inclusive end gives 200 mismatches.

## Publication rules

- Raw files are never published and never committed (`data/raw` is gitignored).
- Published: derived score series (quantized), threshold sweep tables, metrics, and 12 incident windows (about 3,600 rows at most, all 17 channels quantized to 16 bits). These windows are an adapted subset of the CC BY 4.0 data and carry the attribution.

## Required attribution text

"Telemetry and labels: CATS (Controlled Anomalies Time Series) Dataset v2, Solenix Engineering GmbH / Patrick Fleith, doi:10.5281/zenodo.8338435, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes made: channels quantized and windowed; detector scores, metrics and attributions are our own derived results, not endorsed by the dataset creators."

## Open items

- MASTER_PLAN and `research/P06-sources.md` named SMD; this decision supersedes them. Site copy must not say "real server telemetry" or "SMD".
- Optionally email Solenix to confirm the footer wording. Not a blocker given the explicit grant.
