FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY lang/ /usr/share/nginx/html/lang/
COPY bmc-logo.svg /usr/share/nginx/html/bmc-logo.svg
COPY favicon.svg /usr/share/nginx/html/favicon.svg
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
