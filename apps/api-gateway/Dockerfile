FROM apache/apisix:3.19.0-debian

USER root

# Install gettext-base for envsubst
RUN apt-get update \
    && apt-get install -y --no-install-recommends gettext-base curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy custom configurations and entrypoint with apisix ownership
COPY --chown=apisix:apisix conf/ /app/conf/
COPY --chown=apisix:apisix docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
    && chown -R apisix:apisix /app \
    && chown -R apisix:0 /usr/local/apisix \
    && chmod -R g=u /usr/local/apisix

# Cloud Run default port
EXPOSE 8080

# Run container as non-root user for security (Least Privilege principle)
USER apisix

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["docker-start"]
