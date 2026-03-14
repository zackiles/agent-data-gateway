FROM denoland/deno:2.1.4 AS builder
WORKDIR /app
COPY deno.json .
COPY src/ src/
RUN deno compile --allow-net --allow-read --allow-env --allow-run --allow-write --output agent-data-gateway src/server/mod.ts

FROM gcr.io/distroless/cc-debian12
COPY --from=builder /app/agent-data-gateway /agent-data-gateway
COPY data/ /data/
EXPOSE 8080
ENTRYPOINT ["/agent-data-gateway"]
