# Deploy short_videos Firestore Index

The `short_videos` collection requires a composite index for the query `brand_id` + `created_at` desc.

## Option 1: Firebase Console (quickest)

Click this link to create the index (requires Firebase login):

https://console.firebase.google.com/v1/r/project/vantaige-417aa/firestore/indexes?create_composite=ClNwcm9qZWN0cy92YW50YWlnZS00MTdhYS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvc2hvcnRfdmlkZW9zL2luZGV4ZXMvXxABGgwKCGJyYW5kX2lkEAEaDgoKY3JlYXRlZF9hdBACGgwKCF9fbmFtZV9fEAI

## Option 2: Firebase CLI

After re-authenticating (`firebase login --reauth`):

```bash
firebase deploy --only firestore:indexes
```

Index creation takes a few minutes. The query will work once the index is built.
