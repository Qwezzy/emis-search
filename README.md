# EMIS Search — South African Schools 2025

A fast, filterable search engine over the national EMIS Q3 2025 school register (25,527 institutions).

## What it searches
- Official school name
- EMIS / NatEmis number
- Town, suburb, village, street
- Education district and local municipality
- Phase, sector, quintile, fee status, urban/rural

## Run locally
Serve the folder (the JSON cannot load from `file://`):

```bash
python3 -m http.server 8080
```

Open http://localhost:8080
