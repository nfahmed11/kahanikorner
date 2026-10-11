# Cloud Functions: known npm advisories (deferred)

Last checked: 2026-10-11, with `npm audit` in `functions/`.

## Status

8 moderate advisories. No low, high or critical.

All 8 come from one advisory in `uuid`:
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq),
"Missing buffer bounds check in v3/v5/v6 when buf is provided", affecting
`uuid` below 11.1.1. npm also reports each package that depends on it:

```
firebase-admin@13.10.0                 (direct dependency)
├── @google-cloud/firestore@7.11.6
│   └── google-gax@4.6.1
│       └── uuid@9.0.1
└── @google-cloud/storage@7.22.0
    ├── gaxios@6.7.1 → uuid@9.0.1
    └── teeny-request@9.0.0 → uuid@9.0.1   (retry-request depends on teeny-request)
```

| Package | Version | Severity |
|---|---|---|
| uuid | 9.0.1 | moderate (the advisory itself) |
| gaxios, google-gax, teeny-request, retry-request | via uuid | moderate |
| @google-cloud/firestore, @google-cloud/storage | via the above | moderate |
| firebase-admin | 13.10.0 | moderate (pulls in the chain) |

npm's only fix is `firebase-admin` 14.5.0, a major (breaking) upgrade.

## Why it is deferred

- `functions/index.js` and `functions/shipping.js` never `require` firebase-admin
  or uuid. The deployed functions (createCheckoutSession, createArchiveCheckout,
  generateSentence) never load this code, and nothing passes a buffer to uuid.
- firebase-admin 14 is a breaking upgrade and would need its own test and
  deploy cycle.
- Commit cf7b6b9 ("Functions: npm audit fix (non-breaking)") already cleared
  every critical and high advisory without breaking changes.

## Revisit when

- the functions start using firebase-admin (Firestore, Auth, Storage) or uuid;
- any advisory in this chain is raised to high or critical, or a new one appears;
- firebase-functions requires firebase-admin 14;
- the next planned Functions dependency upgrade.

## Rerunning the audit

```sh
cd functions
npm audit                  # summary; expect 8 moderate
npm audit --json           # full detail
npm ls uuid                # where uuid comes from
npm ls firebase-admin      # installed firebase-admin version
npm view firebase-admin version   # latest published version
```

If the count or severity changes, update this file.
