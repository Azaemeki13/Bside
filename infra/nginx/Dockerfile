FROM nginx:1.29-alpine

RUN apk add --no-cache openssl

COPY default.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint-https.sh /usr/local/bin/docker-entrypoint-https.sh

RUN chmod +x /usr/local/bin/docker-entrypoint-https.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint-https.sh"]
CMD ["nginx", "-g", "daemon off;"]
