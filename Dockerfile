FROM node:22-alpine

# Instala ferramentas necessárias para git, node-gyp e módulos C++ nativos
RUN apk add --no-cache git python3 py3-setuptools make g++ build-base

WORKDIR /app

# Copia os manifestos de pacote
COPY package*.json ./

# Instala todas as dependências do projeto
RUN npm install

# Copia todo o código-fonte
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
