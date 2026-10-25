# Headless Chromium with SwiftShader (software WebGL 2), matching the playwright npm version.
#   docker build -t threejs-lab-e2e e2e
#   docker run --rm --network host threejs-lab-e2e http://localhost:3900
FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /e2e
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY run-suite.mjs ./
USER pwuser
ENTRYPOINT ["node", "run-suite.mjs"]
