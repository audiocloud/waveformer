FROM realies/audiowaveform as builder

FROM node:current-alpine

RUN apk add --no-cache libstdc++ ffmpeg

COPY --from=builder /usr/local/bin/audiowaveform /usr/local/bin/audiowaveform

WORKDIR /app

COPY package*.json /app/

RUN npm i

COPY . .

CMD [ "node", "index.mjs" ]
