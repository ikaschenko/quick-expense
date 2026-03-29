FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY lang/ /usr/share/nginx/html/lang/
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
