# Kindle AI Usage Dashboard

## 1. Objetivo

Criar uma página web simples, otimizada para o navegador do Kindle 10ª geração, exibindo apenas:

- Uso atual do Claude Code
- Uso atual do Codex
- Data atual
- Hora atual
- Horário da última atualização

A página deve atualizar automaticamente a cada 5 minutos.

O dashboard não deve exibir:

- Projeto atual
- Nome de repositório
- Valores financeiros
- Dividendos
- Timesheet
- Informações do gato
- Outras informações pessoais

---

## 2. Contexto existente

Já existe um monitor local no caminho:

`C:\laragon\www\Claude-Code-Usage-Monitor`

Repositório:

`https://github.com/andreescocard/Claude-Code-Usage-Monitor`

O projeto existente já consulta o uso autenticado das ferramentas e oferece suporte a:

- Claude Code
- Codex
- Janelas de uso
- Percentual consumido
- Tempo restante até o reset

A nova página deve reutilizar a lógica já existente de consulta de uso, evitando duplicar autenticação ou criar um segundo mecanismo independente.

---

## 3. Escopo do MVP

### 3.1 Claude Code

Exibir:

- Percentual utilizado na janela de 5 horas
- Percentual utilizado na janela semanal
- Tempo restante até o reset da janela de 5 horas
- Tempo restante até o reset semanal
- Estado de erro ou indisponibilidade

### 3.2 Codex

Exibir:

- Percentual utilizado na janela principal
- Percentual utilizado na janela semanal, quando disponível
- Tempo restante até os respectivos resets
- Estado de erro ou indisponibilidade

### 3.3 Data e hora

Exibir:

- Data no formato `DD/MM/YYYY`
- Hora no formato `HH:mm`
- Última atualização no formato `Atualizado às HH:mm`

A hora deve usar o fuso horário local do Windows.

---

## 4. Atualização

A página deve atualizar automaticamente a cada 5 minutos.

Equivalente a:

`300 segundos`

A atualização pode ser implementada inicialmente com:

```html
<meta http-equiv="refresh" content="300">
```

A página também pode atualizar os dados por JavaScript, mas o `meta refresh` deve ser mantido como fallback por compatibilidade com o navegador do Kindle.

---

## 5. Comportamento no Kindle

O dashboard será acessado pelo navegador experimental do Kindle.

Considerar:

- Kindle 10ª geração
- Tela de aproximadamente 600 × 800 px
- Parte superior ocupada pela barra do navegador
- Área segura aproximada de 600 × 680 px
- Navegador com suporte limitado a CSS e JavaScript modernos
- Possibilidade de suspensão automática após 10 minutos
- Manutenção da última imagem na tela e-ink mesmo durante suspensão

O layout deve continuar legível mesmo quando a página não estiver atualizada devido à suspensão do dispositivo.

---

## 6. Interface

### 6.1 Layout sugerido

```text
22/07/2026                         14:35
Atualizado às 14:35

CLAUDE CODE

5 HORAS
██████████████░░░░░░  68%
Reset em 1h 42min

7 DIAS
██████████░░░░░░░░░░  51%
Reset em 3d 8h


CODEX

5 HORAS
████████████████░░░░  79%
Reset em 52min

7 DIAS
██████░░░░░░░░░░░░░░  31%
Reset em 5d 4h
```

### 6.2 Requisitos visuais

- Fundo branco
- Texto preto
- Alto contraste
- Sem cores obrigatórias
- Sem gradientes
- Sem animações
- Sem sombras
- Sem ícones dependentes de emoji
- Fonte sans-serif
- Barras de progresso em preto e branco
- Bordas grossas e legíveis
- Poucos elementos por tela
- Nenhum scroll vertical no layout principal

### 6.3 Tipografia sugerida

- Data e hora: 18–22 px
- Título da ferramenta: 26–32 px
- Nome da janela: 18–22 px
- Percentual: 22–28 px
- Tempo de reset: 16–20 px

---

## 7. Arquitetura

### 7.1 Abordagem recomendada

Adicionar ao projeto existente um pequeno servidor HTTP local.

Fluxo:

```text
Lógica atual de uso
        ↓
Serviço interno do monitor
        ↓
Endpoint JSON
        ↓
Página HTML otimizada para Kindle
```

### 7.2 Endpoints

#### Página principal

```http
GET /kindle
```

Retorna o dashboard HTML.

#### Estado de uso

```http
GET /api/usage
```

Retorna o estado consolidado de Claude Code e Codex.

Exemplo:

```json
{
  "updatedAt": "2026-07-22T14:35:00-03:00",
  "claude": {
    "available": true,
    "fiveHour": {
      "usedPercent": 68,
      "resetsAt": "2026-07-22T16:17:00-03:00"
    },
    "weekly": {
      "usedPercent": 51,
      "resetsAt": "2026-07-25T22:35:00-03:00"
    }
  },
  "codex": {
    "available": true,
    "fiveHour": {
      "usedPercent": 79,
      "resetsAt": "2026-07-22T15:27:00-03:00"
    },
    "weekly": {
      "usedPercent": 31,
      "resetsAt": "2026-07-27T18:35:00-03:00"
    }
  }
}
```

Os nomes das janelas podem ser ajustados conforme os dados reais retornados por cada provedor.

---

## 8. Reutilização do projeto existente

A implementação deve reutilizar:

- Cliente Anthropic já existente
- Cliente Codex já existente
- Leitura das credenciais locais
- Renovação de token já implementada
- Estruturas atuais de uso e rate limit
- Lógica atual de cálculo do tempo até reset
- Polling já existente, quando possível

Não criar nova leitura direta de arquivos de credenciais dentro da página web.

A página deve receber apenas dados sanitizados da aplicação.

---

## 9. Segurança

### 9.1 Requisitos

- Nunca expor tokens OAuth no HTML
- Nunca retornar credenciais em `/api/usage`
- Não retornar cabeçalhos de autorização
- Não retornar conteúdo de `auth.json`
- Não retornar conteúdo de `.credentials.json`
- Não expor histórico de prompts
- Não expor nomes de projetos
- Não expor caminhos locais

### 9.2 Acesso em rede local

Por padrão, o servidor pode escutar em:

`0.0.0.0`

Porta sugerida:

`8787`

URL no Kindle:

`http://IP-DO-COMPUTADOR:8787/kindle`

Recomenda-se permitir acesso apenas pela rede local.

Opcionalmente, adicionar um token simples na URL:

`http://IP-DO-COMPUTADOR:8787/kindle?token=TOKEN_LOCAL`

Esse token não substitui autenticação robusta, mas evita acesso casual por outros dispositivos da rede.

---

## 10. Cache

As respostas devem impedir cache prolongado.

Headers sugeridos:

```http
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
Expires: 0
```

Isso é importante para evitar que o Kindle continue exibindo uma versão antiga após o refresh.

---

## 11. Compatibilidade

A página deve usar:

- HTML simples
- CSS tradicional
- JavaScript ES5 ou o mínimo possível
- Sem React
- Sem Angular
- Sem Tailwind
- Sem WebSockets
- Sem Canvas obrigatório
- Sem dependência de fontes externas
- Sem SVG complexo
- Sem bibliotecas carregadas por CDN

Preferir renderização server-side.

---

## 12. Tratamento de erros

Quando um provedor estiver indisponível:

```text
CLAUDE CODE
Dados indisponíveis
Última tentativa: 14:35
```

Quando não estiver autenticado:

```text
CODEX
Não autenticado
Abra o Codex CLI no computador
```

Quando os dados estiverem antigos:

```text
Dados desatualizados
Última atualização: 13:20
```

Considerar os dados desatualizados após 15 minutos.

---

## 13. Suspensão do Kindle

O Kindle suspende após aproximadamente 10 minutos.

O MVP não precisa impedir a suspensão.

Comportamento esperado:

1. A página atualiza a cada 5 minutos enquanto o navegador estiver ativo.
2. Quando o Kindle suspender, a última tela permanecerá visível.
3. Ao acordar, a página deve recarregar automaticamente ou atualizar em até 5 minutos.
4. O horário de última atualização deve deixar claro se os dados estão antigos.

Uma futura versão poderá estudar:

- Modo tela cheia
- Jailbreak
- Atualização por imagem
- Despertar programado
- Download periódico com Wi-Fi desligado entre atualizações

Esses itens estão fora do MVP.

---

## 14. Estrutura sugerida

A estrutura deve respeitar a organização atual do repositório.

Exemplo conceitual:

```text
src/
  usage/
    claude-usage.*
    codex-usage.*
    usage-service.*

  kindle/
    kindle-server.*
    kindle-view.*
    kindle-types.*

assets/
  kindle/
    kindle.css
    kindle.html
```

Os nomes reais devem seguir a linguagem e o padrão já utilizados no projeto.

---

## 15. Critérios de aceite

O MVP estará concluído quando:

- A página abrir no navegador do Kindle.
- Claude Code aparecer com percentual e reset.
- Codex aparecer com percentual e reset.
- Data e hora forem exibidas.
- A página atualizar a cada 5 minutos.
- O layout couber sem scroll.
- Nenhuma credencial for exposta.
- Nenhum projeto ou caminho local aparecer.
- A página funcionar sem frameworks modernos.
- Um erro em Claude não impedir a exibição do Codex.
- Um erro em Codex não impedir a exibição do Claude.
- A última atualização ficar claramente visível.

---

## 16. Fora do escopo inicial

- Métricas por projeto
- Histórico diário ou mensal
- Custos em dinheiro
- Tokens por sessão
- Patrimônio ou investimentos
- Dividendos
- Timesheet
- Home Assistant
- Alimentação do gato
- Clima
- Calendário
- Notificações push
- Aplicativo móvel
- Jailbreak do Kindle
- Tela cheia nativa
- Deploy em servidor público

---

## 17. Próximas etapas

1. Identificar no projeto atual a camada que consolida Claude e Codex.
2. Extrair uma estrutura comum de dados de uso.
3. Criar `/api/usage`.
4. Criar `/kindle`.
5. Adicionar atualização de 5 minutos.
6. Testar no Chrome com viewport de 600 × 680.
7. Testar diretamente no navegador do Kindle.
8. Ajustar fontes, espaçamentos e barras.
9. Validar suspensão e retorno do navegador.
