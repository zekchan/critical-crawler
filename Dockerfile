FROM node:11-alpine
WORKDIR /app
ENV CHROME_BIN="/usr/bin/chromium-browser"\
  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"\
  DEBUG=false
EXPOSE 3000
CMD ["node", "index"]
RUN set -x \
  && apk update \
  && apk upgrade \
  && apk add --no-cache \
  udev \
  ttf-freefont \
  chromium
COPY package.json yarn.lock ./
RUN yarn
COPY index.js crawlPage.js ./

