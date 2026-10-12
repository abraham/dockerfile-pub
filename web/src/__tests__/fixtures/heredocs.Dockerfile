FROM alpine:3.21
RUN <<EOF
set -eux
apk add --no-cache curl
if [ -f /etc/os-release ]; then cat /etc/os-release; fi
EOF
COPY <<-CONF /etc/app.conf
	listen 8080
	CONF
RUN <<A cat > /a && <<'B' cat > /b
first
A
second $HOME
B
ONBUILD COPY . /app
ONBUILD RUN make build
MAINTAINER Jane Doe <jane@example.com>
ENV LEGACY value with spaces
