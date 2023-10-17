FROM realies/audiowaveform as builder

ENTRYPOINT [ "/usr/bin/node" ]

RUN apk add --no-cache libstdc++ ffmpeg nodejs npm

WORKDIR /app

FROM builder as dev
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --include=dev
COPY . .
EXPOSE 3000
CMD ["/usr/bin/npm", "run", "dev"]

FROM builder as prod
RUN [ "/usr/bin/npm", "i" ]
COPY . .
RUN [ "/usr/bin/npm", "run", "build" ]
CMD [ "/usr/bin/npm", "start" ]
