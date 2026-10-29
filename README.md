# Insta Senac

Aplicativo mobile em React Native/Expo, API em Node.js/Express com PostgreSQL e painel administrativo web.

## Requisitos

- Node.js LTS e npm
- Docker com Docker Compose
- Git
- Para gerar o aplicativo Android: conta Expo e EAS CLI

## Executar localmente

Siga os passos na ordem. Os comandos são executados na raiz do repositório, salvo indicação diferente.

### 1. Baixar o projeto e configurar os segredos

```sh
git clone <URL_DO_REPOSITORIO>
cd InstaSenac
cp .env.example .env
cp backend/.env.example backend/.env
```

No PowerShell, em vez dos dois últimos comandos, use:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

Edite os dois arquivos recém-criados. Gere uma senha forte (por exemplo, com `openssl rand -hex 32`) e use-a em `POSTGRES_PASSWORD` na raiz e em `DATABASE_URL` no backend. Gere também um valor diferente para `JWT_SECRET`. No `backend/.env`, configure:

- `DATABASE_URL`: URL do banco local, usando a mesma senha definida no `.env` da raiz.
- `JWT_SECRET`: segredo aleatório forte, diferente da senha do banco.
- `CORS_ORIGIN`: origem do painel, normalmente `http://localhost:5173`.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` e `ADMIN_ENROLLMENT_NUMBER`: dados do primeiro administrador. A senha deve ter pelo menos 12 caracteres.

Não publique arquivos `.env` nem reutilize credenciais de desenvolvimento em produção. O `.gitignore` impede novos arquivos locais de serem adicionados, mas não remove segredos já versionados; antes de publicar, revise o histórico do Git e troque qualquer credencial que já tenha sido compartilhada.

### 2. Iniciar o banco e criar as tabelas

```sh
docker compose up -d database
docker compose exec database pg_isready -U postgres
```

Execute o esquema inicial uma vez:

```sh
docker compose exec -T database psql -U postgres -d meu_app_db < database/schema.sql
```

No PowerShell:

```powershell
Get-Content -Raw database/schema.sql | docker compose exec -T database psql -U postgres -d meu_app_db
```

Para um banco que já existe, aplique as migrações indicadas em `database/migrations/` antes de iniciar uma versão que dependa delas.

### 3. Instalar, compilar e iniciar a API

```sh
cd backend
npm ci
npm run create-admin
npm run dev
```

A API fica disponível em `http://localhost:3000`.

Para compilar a API para produção, execute em `backend`:

```sh
npm run build
npm start
```

### 4. Abrir o painel administrativo

Em outro terminal, na raiz do repositório:

```sh
npx serve admin -l 5173
```

Acesse `http://localhost:5173`. O painel permite cadastrar categorias e alunos e consultar ou excluir alunos.

### 5. Executar o aplicativo mobile

Em outro terminal:

```sh
cd mobile
cp .env.example .env
```

No PowerShell, use `Copy-Item .env.example .env` no lugar de `cp`. Configure `EXPO_PUBLIC_API_URL` em `mobile/.env`:

- No emulador Android padrão: `http://10.0.2.2:3000/api`
- Em um celular físico: `http://<IP_DO_COMPUTADOR>:3000/api`

Depois instale as dependências e inicie o Expo:

```sh
npm ci
npm start
```

O dispositivo precisa alcançar a API pela rede. Reinicie o Expo após mudar a URL.

## Gerar os aplicativos para distribuição

O painel web é composto pelos arquivos estáticos em `admin/`; a API é compilada com `npm run build`, conforme acima. Para gerar um instalador mobile, use o EAS Build. Configure `EXPO_PUBLIC_API_URL` como variável de ambiente `production` do projeto Expo, apontando para a URL HTTPS pública da API; esse valor é incorporado ao aplicativo.

Na pasta `mobile`, autentique-se no Expo, configure o EAS para o projeto e gere o pacote Android:

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile production
```

O EAS pode solicitar que o projeto seja associado a uma conta Expo e que sejam configuradas credenciais de assinatura. Para distribuir pela Play Store, use o AAB produzido pelo perfil de produção. Para iOS, configure também a identificação e as credenciais Apple e substitua `--platform android` por `--platform ios`.

## Hospedar em uma VPS Ubuntu

Exemplo de implantação com PostgreSQL em Docker, API Node.js e Nginx. Use um domínio com HTTPS; não exponha diretamente as portas do banco ou da API à internet.

### 1. Preparar o servidor

Instale Git, Node.js LTS, Docker com o plugin Compose, Nginx, Certbot (`python3-certbot-nginx`) e o cliente PostgreSQL usando as instruções oficiais para a versão do Ubuntu da VPS. Configure o DNS do domínio para apontar para o endereço do servidor e libere no firewall somente SSH, HTTP e HTTPS.

### 2. Baixar o projeto e configurar o banco

```sh
sudo mkdir -p /opt/instasenac
sudo chown "$USER":"$USER" /opt/instasenac
git clone <URL_DO_REPOSITORIO> /opt/instasenac
cd /opt/instasenac
cp .env.example .env
```

Edite `.env` e defina uma senha forte para `POSTGRES_PASSWORD` (por exemplo, gere uma com `openssl rand -hex 32`). Use essa mesma senha em `backend/.env`, na URL `DATABASE_URL`. Inicie o banco e confirme que está pronto:

```sh
docker compose up -d database
docker compose exec database pg_isready -U postgres
docker compose exec -T database psql -U postgres -d meu_app_db < database/schema.sql
```

Guarde os dados do banco e do volume Docker em backups seguros.

### 3. Configurar, compilar e criar o administrador

```sh
cd /opt/instasenac/backend
cp .env.example .env
```

Edite `backend/.env` com `DATABASE_URL` apontando para `localhost:5432` e a senha do banco, um `JWT_SECRET` novo e aleatório, `CORS_ORIGIN=https://<SEU_DOMINIO>` e os quatro valores `ADMIN_*`. Não use as credenciais de demonstração.

```sh
npm ci
npm run build
npm run create-admin
```

Mantenha `backend/media/` em armazenamento persistente e faça backup dessa pasta: ela contém os arquivos de usuários. O volume Docker `postgres_data` também deve ser preservado ao atualizar o projeto.

### 4. Manter a API em execução

Crie uma conta de sistema para a API e dê a ela acesso aos arquivos de mídia:

```sh
sudo useradd --system --home /opt/instasenac --shell /usr/sbin/nologin instasenac
sudo mkdir -p /opt/instasenac/backend/media
sudo chown -R instasenac:instasenac /opt/instasenac/backend/media
sudo chown root:instasenac /opt/instasenac/backend/.env
sudo chmod 640 /opt/instasenac/backend/.env
```

Se `command -v node` não retornar `/usr/bin/node`, ajuste `ExecStart` no serviço para o caminho encontrado.

Crie o serviço:

```sh
sudo tee /etc/systemd/system/instasenac.service >/dev/null <<'EOF'
[Unit]
Description=Insta Senac API
After=network.target docker.service

[Service]
Type=simple
User=instasenac
Group=instasenac
WorkingDirectory=/opt/instasenac/backend
EnvironmentFile=/opt/instasenac/backend/.env
ExecStart=/usr/bin/node /opt/instasenac/backend/dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now instasenac
sudo systemctl status --no-pager instasenac
```

Garanta que a conta do serviço tenha permissão de escrita em `backend/media/`. A API usa a porta definida em `PORT` (padrão `3000`); bloqueie essa porta no firewall público e permita acesso a ela somente localmente pelo Nginx.

### 5. Configurar Nginx e HTTPS

Crie `/etc/nginx/sites-available/instasenac` e substitua `app.exemplo.com` pelo seu domínio:

```nginx
server {
    listen 80;
    server_name app.exemplo.com;
    root /opt/instasenac/admin;
    index index.html;
    client_max_body_size 65m;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Ative o site e habilite HTTPS:

```sh
sudo ln -s /etc/nginx/sites-available/instasenac /etc/nginx/sites-enabled/instasenac
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d app.exemplo.com
```

Configure `CORS_ORIGIN` como a origem HTTPS exata do painel, reinicie a API e teste o login administrativo e o acesso à API e às mídias pelo domínio. O painel usa `/api` no mesmo domínio em produção e continua usando `http://localhost:3000/api` em desenvolvimento.

Ao atualizar o servidor, preserve `.env`, `backend/media/` e o volume do banco. Faça backup antes de aplicar migrações. Nunca execute `npm run seed:demo` em produção: ele cria contas e publicações com credenciais públicas conhecidas.

## Dados de demonstração

Opcionalmente, em desenvolvimento, coloque pelo menos dez imagens na pasta `moke/` e execute `npm run seed:demo` em `backend`. O comando cria ou atualiza dez usuários (`demo01@instasenac.local` a `demo10@instasenac.local`), publica as imagens e copia os arquivos para `backend/media/demo`. A senha comum é `Demo@123456`; use essas contas apenas localmente.
