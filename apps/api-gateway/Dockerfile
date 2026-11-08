FROM apache/apisix:3.19.0-debian

USER root

# Install gettext-base for envsubst
RUN apt-get update \
    && apt-get install -y --no-install-recommends gettext-base curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy custom configurations and entrypoint
COPY conf/ /app/conf/
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Cloud Run default port
EXPOSE 8080

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["docker-start"]
