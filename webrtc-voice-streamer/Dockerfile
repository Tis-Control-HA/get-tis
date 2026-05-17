ARG BUILD_FROM=alpine:latest

FROM $BUILD_FROM

# Install dependencies
RUN apk update && \
    apk add --no-cache python3 py3-pip curl openssl ca-certificates jq netcat-openbsd bash

# Set working directory to /app
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

# Copy application files (Python scripts and root files)
COPY *.py ./
COPY *.yaml ./
COPY ui/ ./ui/

# Copy scripts to root
COPY run.sh /

# Fix permissions
RUN chmod a+x *.py && chmod a+x /run.sh

EXPOSE 8099 8443 8555 8080

CMD ["/run.sh"]
