# OVO WeChat–Chatwoot Bridge

Security-first bridge contract and domain core for connecting an official
WeChat Customer Service account to a dedicated Chatwoot API Inbox.

This package intentionally never logs into or automates personal WeChat. A
personal friend can receive one manually sent supplier-specific KF link; all
automated processing starts only after the supplier enters that official
service conversation.

## Current status

Implemented and tested:

- official conversation/window/quota state machine;
- fixed-template versus human-approved reply policy;
- Chatwoot outbound filtering;
- Tencent and Chatwoot webhook signature verification;
- Tencent AES-CBC payload decryption with receiver validation;
- D1 persistence schema;
- production architecture and rollout gate.

Not yet live:

- Tencent/Chatwoot network adapters;
- Cloudflare Worker routes and queue consumer;
- D1 resource and Worker deployment;
- live Chatwoot API Inbox;
- live messages of any kind.

Those require a verified WeCom organization with WeChat Customer Service
enabled, a decision on Tencent trusted-IP requirements, and recorded test
fixtures. Never paste credentials into source control or chat.

## Verify

```sh
npm install
npm run check
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the complete design and platform
boundary.
