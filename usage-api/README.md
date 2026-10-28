# Kindle AI Usage Dashboard for CasaOS

Local Docker Compose app that shows your Claude Code and Codex subscription
usage on a simple page made for the Kindle. It also offers a sanitized JSON API.

## Install on CasaOS

1. Copy this folder to the CasaOS server (for example,
   `/DATA/AppData/kindle-ai-usage/app`).
2. In **App Store > Custom Install**, import the `compose.yml` file from that
   folder. Alternatively, run `docker compose up -d --build` in it.
3. Choose the host port by changing `WEB_PORT`; the internal port stays 8787.
4. Start the app.
5. Open the terminal of the `kindle-ai-usage` container and log in to both CLIs:

```sh
claude auth login
codex login --device-auth
```

The logins are persisted only in
`/DATA/AppData/kindle-ai-usage`. The app reads the credentials on the server to
query the usage APIs, but never sends them to the HTML or to `/api/usage`.

Then open:

```text
http://CASAOS-IP:PORT/kindle
```

API:

```text
http://CASAOS-IP:PORT/api/usage
```

## Optional local token

Set `LOCAL_TOKEN` in the Compose file to prevent casual access from other
devices on the network. In that case use:

```text
http://CASAOS-IP:PORT/kindle?token=YOUR_TOKEN
http://CASAOS-IP:PORT/api/usage?token=YOUR_TOKEN
```

## Development

```sh
npm test
docker compose build
docker compose up -d
```

Polling is independent per provider and runs every 300 seconds by default
(`POLL_SECONDS`; the provided `compose.yml` sets it to 60). An error in
Claude does not block Codex, and vice versa. The HTML uses no JavaScript,
frameworks, CDNs or external fonts and keeps `meta refresh` as a fallback for
the Kindle.
