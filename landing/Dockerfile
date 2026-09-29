FROM nginx:alpine
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY index.html /usr/share/nginx/html/index.html
COPY lang/ /usr/share/nginx/html/lang/
COPY images/ /usr/share/nginx/html/images/
COPY bmc-logo.svg /usr/share/nginx/html/bmc-logo.svg
COPY favicon.svg /usr/share/nginx/html/favicon.svg
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
