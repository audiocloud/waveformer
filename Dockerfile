FROM realies/audiowaveform as builder

FROM node:current-alpine as base

RUN apk add --no-cache libstdc++ ffmpeg

COPY --from=builder /usr/local/bin/audiowaveform /usr/local/bin/audiowaveform

WORKDIR /app

FROM base as dev
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --include=dev
USER node
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base as prod
ENV NODE_ENV production
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev
USER node

COPY package*.json /app/

RUN npm i

COPY . .

RUN npm run build

CMD [ "npm", "start" ]
