# Kindle como monitor de limites do Claude Code e do Codex

Um Kindle antigo virou um painel fixo na mesa que mostra quanto já usei dos limites de 5 horas e semanais do Claude Code e do Codex. A tela de tinta eletrônica não cansa a vista, fica legível com qualquer luz e gasta quase nada para manter a imagem parada.

<p align="center"><img src="docs/preview.png" width="360" alt="Tela do Kindle com barras de uso do Claude e do Codex"></p>

Cada serviço tem duas linhas:

- **5h**: a janela curta, que reinicia algumas horas depois do primeiro uso.
- **7d**: o limite semanal.

As 10 barrinhas enchem conforme o uso. Ao lado aparecem o percentual e quanto tempo falta para reiniciar, e embaixo o dia e a hora exatos do reinício. A partir de 90% aparece um aviso de "LIMITE PRÓXIMO". No rodapé ficam a bateria do Kindle, com uma estimativa de horas restantes, e o horário da última atualização.

O visual das barras foi inspirado no widget de barra de tarefas [Claude-Code-Usage-Monitor](https://github.com/CodeZeno/Claude-Code-Usage-Monitor), que eu já usava no desktop.

## Como funciona

```
 Servidor de casa (Beelink, CasaOS)                                   Kindle
 +------------------------------------+                       +-----------------------+
 | usage-api (Docker, porta 8787)     |                       | monitor-ia.sh         |
 |   consulta a cada 60s as APIs de   |                       |   liga o Wi-Fi        |
 |   uso do Claude e do Codex com os  |                       |   baixa o PNG  <------+---- a cada 5 min
 |   logins feitos dentro do container|                       |   desliga o Wi-Fi     |
 |   GET /api/usage  -> JSON          |                       |   desenha com FBInk   |
 |                                    |   GET /kindle.png     |   toque = sair        |
 | server.py (porta 8788)             | <---------------------+                       |
 |   lê /api/usage e desenha um PNG   |   ?bat=78&chg=0       +-----------------------+
 |   600x800 em tons de cinza         |
 +------------------------------------+
```

A decisão principal foi deixar todo o trabalho no servidor. O Kindle só baixa uma imagem pronta do tamanho exato da tela e a desenha. Assim não precisa de Python, navegador nem fontes no aparelho, e qualquer mudança visual é feita no servidor sem encostar no Kindle.

O notebook onde comecei o projeto é desligado com frequência, então nada pode depender dele. Tudo roda no Beelink, um mini PC que fica ligado o tempo todo.

## Requisitos

**Kindle**

- Um Kindle com jailbreak. Usei um Kindle Basic 10ª geração (KT4) com firmware 5.18.1.1.1 e o jailbreak SpiderCat. O guia de cada modelo e firmware está em [kindlemodding.org](https://kindlemodding.org).
- Suporte a scriptlets: arquivos `.sh` na pasta `documents` aparecem na Biblioteca como livros e rodam como root ao serem tocados. No SpiderCat isso já vem pronto.
- [FBInk](https://github.com/NiLuJe/FBInk) para desenhar na tela. Ele vem junto com o pacote libkh do jailbreak (`/mnt/us/libkh/bin/fbink`).
- Wi-Fi na mesma rede do servidor.

**Servidor**

- Qualquer máquina Linux que fique ligada. Usei um Beelink com Ubuntu 22.04 e CasaOS.
- Docker, para a `usage-api`.
- [uv](https://docs.astral.sh/uv/) para rodar o `server.py`. Ele baixa o Pillow sozinho, sem precisar de sudo, pip ou venv.
- As fontes Liberation Sans (`LiberationSans-Regular.ttf` e `LiberationSans-Bold.ttf`) numa pasta `fonts/` ao lado do `server.py`.

**Contas**

- Assinatura do Claude (Pro ou Max) com login no Claude Code.
- Assinatura do ChatGPT com login no Codex.

## O que tem no repositório

| Caminho | O que é |
|---|---|
| `usage-api/` | App Node em Docker que faz login no Claude Code e no Codex e expõe `/api/usage` em JSON. Também tem uma página HTML simples em `/kindle`. |
| `server.py` | Renderizador. Lê o JSON e devolve o PNG 600x800 em `/kindle.png`. Também serve o script do Kindle e recebe logs remotos. |
| `kindle/monitor-ia.sh` | Scriptlet que roda no Kindle. Aparece na Biblioteca como "Monitor IA". |
| `kindle/tela-sempre-ligada.sh`, `kindle/tela-normal.sh` | Atalhos para ligar e desligar o descanso de tela. |
| `deploy/` | Script de inicialização e entradas de cron do servidor. |

## Passo a passo

### 1. Jailbreak do Kindle

Siga o guia do seu modelo em [kindlemodding.org](https://kindlemodding.org). Antes de começar, faça backup da partição do Kindle pelo USB. Depois do jailbreak, confirme que um `.sh` qualquer copiado para `documents` aparece na Biblioteca.

### 2. Serviço de uso (`usage-api`)

No servidor:

```sh
cp -r usage-api /DATA/AppData/kindle-ai-usage/app
cd /DATA/AppData/kindle-ai-usage/app
sudo docker compose up -d --build
```

O `compose.yml` usa caminhos do CasaOS (`/DATA/AppData/...`). Em outro sistema, ajuste o volume.

Faça os logins dentro do container:

```sh
sudo docker exec -it kindle-ai-usage claude auth login
sudo docker exec -it kindle-ai-usage codex login --device-auth
```

Se o login do Codex pelo código do dispositivo falhar, rode `codex login` normal. Ele mostra uma URL para abrir no navegador. No fim, o navegador tenta abrir `http://localhost:1455/auth/callback?...` e dá erro, porque o callback deveria chegar no container. Copie essa URL inteira e rode dentro do container `curl "URL_COPIADA"`.

Teste com `curl http://localhost:8787/api/usage`. O formato esperado é este:

```json
{
  "updatedAt": "2026-10-28T01:15:12.664Z",
  "stale": false,
  "claude": {
    "available": true,
    "status": "available",
    "fiveHour": { "usedPercent": 2, "resetsAt": "2026-10-28T06:10:00Z" },
    "weekly":   { "usedPercent": 63, "resetsAt": "2026-10-28T08:00:00Z" }
  },
  "codex": { "...": "mesmo formato" }
}
```

Qualquer outro serviço que devolva esse JSON funciona com o renderizador. Basta apontar `USAGE_URL` para ele.

### 3. Renderizador (`server.py`)

```sh
mkdir -p ~/kindle-monitor/fonts
cp server.py kindle/monitor-ia.sh deploy/run.sh ~/kindle-monitor/
cp /caminho/das/LiberationSans-*.ttf ~/kindle-monitor/fonts/
~/kindle-monitor/run.sh
crontab -e   # cole o conteúdo de deploy/crontab.txt
```

Para conferir, abra `http://IP-DO-SERVIDOR:8788/kindle.png` no navegador. O `run.sh` espera o `uv` em `~/.local/bin/uv`.

Variáveis opcionais: `PORT` (padrão 8788), `USAGE_URL` (padrão `http://127.0.0.1:8787/api/usage`), `DISPLAY_TZ` (padrão `America/Sao_Paulo`) e `FONT_DIR`.

Para gerar só uma imagem de teste, sem subir o servidor: `uv run --script server.py --once teste.png`.

### 4. Script no Kindle

Edite a linha `BASE=` do `kindle/monitor-ia.sh` com o IP do seu servidor. Depois copie o arquivo para a pasta `documents` do Kindle pelo USB. Ele aparece na Biblioteca como **Monitor IA**.

Essa cópia pelo USB só é necessária uma vez. A cada abertura, o script baixa a versão que está no servidor (`/monitor-ia.sh`) e se substitui se ela mudou. Para atualizar o Kindle, basta trocar o arquivo no servidor.

## Uso

- **Abrir:** toque em "Monitor IA" na Biblioteca. A interface do Kindle é desligada e o painel aparece em alguns segundos.
- **Sair:** toque em qualquer lugar da tela ou aperte o botão de energia. A interface do Kindle volta em cerca de 1 minuto. Durante esse tempo aparece a mensagem "Saindo do Monitor IA...".
- **Logs:** o Kindle manda cada evento importante para o servidor, que grava em `~/kindle-monitor/server.log` com o prefixo `KINDLE`. Assim dá para investigar problemas sem cabo USB. Há também um log local em `/mnt/us/monitor-ia.log`.

## O que o script faz no Kindle

1. Liga `preventScreenSaver` para a tela nunca bloquear.
2. Para a interface do Kindle (`stop lab126_gui`). Sem isso, a interface redesenha por cima do painel e reage aos toques.
3. Abre um leitor em segundo plano para cada dispositivo de entrada (`/dev/input/event*`). O primeiro toque ou botão encerra o monitor.
4. A cada 5 minutos: liga o Wi-Fi, espera conectar, baixa o PNG passando a bateria (`?bat=78&chg=0`), desliga o Wi-Fi e redesenha só se a imagem mudou. A cada 10 atualizações faz um refresh completo, com piscada, para limpar o fantasma da tinta eletrônica.
5. Se o download falhar, tenta de novo a cada 10 segundos e avisa na tela depois de duas falhas.
6. Ao sair: religa o Wi-Fi, devolve o descanso de tela, sobe a interface de novo, espera a Biblioteca (`KPPMainApp`) aparecer e força dois refreshes de tela.

## Bateria

Medição real com o Kindle fora da tomada e o monitor aberto: de 97% para 70% em 6h15, cerca de 4,3% por hora, o que dá umas 22 horas de uso contínuo.

Desligar o Wi-Fi entre as atualizações quase não mudou esse número. Antes dessa mudança a medição tinha ficado em torno de 4% por hora. O gasto vem principalmente de manter o processador acordado o tempo todo, e não do rádio. Na prática, o melhor uso é deixar o Kindle no carregador, como um painel de mesa. Para durar dias na bateria, o caminho seria suspender o aparelho entre as atualizações e acordá-lo pelo relógio interno (RTC). Ainda não fiz isso.

## Problemas que apareceram e como resolvi

**A tela bloqueava depois de alguns minutos.** Este foi o motivo do projeto. Sem jailbreak não há como desligar o descanso de tela. Com jailbreak, basta `lipc-set-prop com.lab126.powerd preventScreenSaver 1`.

**O Kindle parecia travado enquanto eu copiava arquivos.** Era só a gravação lenta pelo USB. Bastou esperar.

**Tela totalmente branca ao abrir o monitor.** Depois de tirar o cabo USB, o Wi-Fi demora para reconectar e o primeiro download falhava. Agora o script tenta de novo a cada 10 segundos e mostra "Sem conexão" na tela.

**"O aplicativo selecionado não pode ser iniciado" ao sair.** Eu tentava abrir a tela inicial com `app://com.lab126.booklet.home`, que não existe nesse firmware. A Biblioteca é o `com.lab126.KPPMainApp`. Removi a chamada e passei só a reiniciar a interface.

**Tela parada em "Saindo..." mesmo depois da interface voltar.** Logo depois de reiniciar a interface, o Kindle ainda informa como app ativo o lançador do scriptlet, e o script achava que já estava pronto. Agora ele espera 15 segundos, aguarda especificamente o `KPPMainApp` (por até 2 minutos e meio) e faz dois refreshes completos. Se a tela ficar parada mesmo assim, um toque curto no botão de energia (dormir e acordar) força o redesenho.

**Login do Codex no container falhava com "error sending request for url".** A imagem `node:22-bookworm-slim` vem sem certificados raiz. O `Dockerfile` deste repositório já instala o `ca-certificates`.

**Os logins conflitam com os do meu desktop?** Não. Cada máquina tem seu próprio login e eles convivem bem. O que dá problema é copiar o arquivo de credenciais de uma máquina para outra: os tokens de renovação são rotativos, e uma cópia acaba invalidando a outra.

**Servidor sem pip, venv nem sudo.** Copiei o binário do `uv` para `~/.local/bin`. O `server.py` declara a dependência do Pillow no próprio arquivo (PEP 723) e o `uv` resolve o resto.

**Bordas serrilhadas na tinta eletrônica.** O PNG é desenhado no dobro da resolução e reduzido com LANCZOS no fim. Para barras parcialmente cheias, uso uma máscara com o formato do bloco, o que mantém os cantos arredondados e o corte reto.

## Comandos úteis no Kindle

```sh
lipc-get-prop com.lab126.powerd battLevel          # bateria
lipc-get-prop com.lab126.powerd isCharging
lipc-set-prop com.lab126.cmd wirelessEnable 0      # Wi-Fi (1 liga)
lipc-get-prop com.lab126.wifid cmState             # CONNECTED quando conectado
lipc-get-prop com.lab126.appmgrd activeApp         # app em primeiro plano
stop lab126_gui ; start lab126_gui                 # interface do Kindle
/mnt/us/libkh/bin/fbink -c -f -g file=img.png      # desenha uma imagem
/mnt/us/libkh/bin/fbink -s -f                      # refresh completo da tela
```

## Créditos

- [Claude-Code-Usage-Monitor](https://github.com/CodeZeno/Claude-Code-Usage-Monitor), pela ideia do visual com barras segmentadas.
- [FBInk](https://github.com/NiLuJe/FBInk), de NiLuJe, que desenha na tela do Kindle.
- A comunidade do [kindlemodding.org](https://kindlemodding.org) e do MobileRead, pelo jailbreak.

O projeto foi feito em parceria com o Claude Code, que escreveu boa parte do código enquanto eu testava no aparelho.

## Licença

MIT
