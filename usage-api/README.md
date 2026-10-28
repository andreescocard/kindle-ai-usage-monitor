# Kindle AI Usage Dashboard para CasaOS

App local em Docker Compose que exibe o uso das assinaturas Claude Code e Codex
em uma página simples para Kindle. Também oferece uma API JSON sanitizada.

## Instalar no CasaOS

1. Copie esta pasta para o servidor CasaOS (por exemplo,
   `/DATA/AppData/kindle-ai-usage/app`).
2. Em **App Store > Custom Install**, importe o arquivo `compose.yml` dessa
   pasta. Como alternativa, execute `docker compose up -d --build` nela.
3. Escolha a porta do host alterando `WEB_PORT`; a porta interna permanece 8787.
4. Inicie o app.
5. Abra o terminal do container `kindle-ai-usage` e autentique os dois CLIs:

```sh
claude auth login
codex login --device-auth
```

Os logins ficam persistidos somente em
`/DATA/AppData/kindle-ai-usage`. O app lê as credenciais no servidor para
consultar as APIs de uso, mas nunca as envia para o HTML ou para `/api/usage`.

Depois, abra:

```text
http://IP-DO-CASAOS:PORTA/kindle
```

API:

```text
http://IP-DO-CASAOS:PORTA/api/usage
```

## Token local opcional

Defina `LOCAL_TOKEN` no Compose para evitar acesso casual por outros aparelhos
da rede. Nesse caso use:

```text
http://IP-DO-CASAOS:PORTA/kindle?token=SEU_TOKEN
http://IP-DO-CASAOS:PORTA/api/usage?token=SEU_TOKEN
```

## Desenvolvimento

```sh
npm test
docker compose build
docker compose up -d
```

O polling é independente por provedor e ocorre a cada 300 segundos. Um erro no
Claude não bloqueia o Codex, e vice-versa. O HTML não usa JavaScript, frameworks,
CDNs ou fontes externas e mantém `meta refresh` como fallback para o Kindle.
