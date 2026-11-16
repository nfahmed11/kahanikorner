# Deploy notes

## Hosting

```
firebase deploy --only hosting
```

Deploy hosting from any branch. Functions are unaffected.

## Functions

Functions on `main` match what is live as of 2026-11-15 (commit `d73fa77`).

Before deploying functions:
- Confirm `STRIPE_SECRET_KEY` exists in Secret Manager: `firebase functions:secrets:get STRIPE_SECRET_KEY`
- After deploy, open a subscription checkout and a back-issue checkout on the live site. Stop at the Stripe payment page — do not pay. Confirm both show the right price and shipping.

```
firebase deploy --only functions
```

**Rollback:** redeploy the last known-good commit.
```
git checkout <commit>
firebase deploy --only functions
git checkout main
```
