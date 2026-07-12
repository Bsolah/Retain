#!/bin/sh
# Always serve the admin SPA. Railway often overrides CMD with a leftover
# monorepo start command (`pnpm …` or the old nginx entrypoint); ignore argv.
exec node /app/server.mjs
