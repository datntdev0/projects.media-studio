# Firebase emulator suite: Node for the CLI, a JRE for the Firestore/Storage emulators.
# Trixie, not bookworm: firebase-tools 15 refuses to run on a JDK older than 21.
FROM node:22-trixie-slim

ARG FIREBASE_TOOLS_VERSION=15.26.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-21-jre-headless curl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g firebase-tools@${FIREBASE_TOOLS_VERSION}

# Pull the emulator jars now so a container starts without reaching the network.
RUN firebase setup:emulators:database && firebase setup:emulators:firestore && firebase setup:emulators:storage && firebase setup:emulators:ui

# Baked in rather than bind-mounted: Docker Desktop's Windows file sharing serves these
# small files unreliably. Re-run with `--build` after editing the config or the rules.
COPY firebase.json .firebaserc database.rules.json firestore.rules firestore.indexes.json storage.rules /config/

# Writable cwd for the emulators' debug logs; the config is in /config, the data in /data.
WORKDIR /workspace

EXPOSE 4000 4400 4500 8080 9000 9099 9150 9199
