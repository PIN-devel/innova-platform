FROM apache/apisix:3.19.0-debian

USER root

# Install gettext-base for envsubst
RUN apt-get update \
    && apt-get install -y --no-install-recommends gettext-base curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Ensure runtime config directory is owned by apisix
RUN mkdir -p /usr/local/apisix/conf /usr/local/apisix/logs \
    && chown -R apisix:0 /usr/local/apisix \
    && chmod -R g=u /usr/local/apisix

# Copy custom configurations and entrypoint owned by root (read-only for non-root, S6504 compliant)
COPY --chown=root:root conf/ /app/conf/
COPY --chown=root:root docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod 755 /app/docker-entrypoint.sh \
    && chmod 755 /app/conf \
    && chmod 644 /app/conf/*

# Cloud Run default port
EXPOSE 8080

# Run container as non-root user for security (Least Privilege principle)
USER apisix

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["docker-start"]
