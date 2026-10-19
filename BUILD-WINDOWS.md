# Build do instalador Windows (x64)

Gera o instalador do app desktop (Electron) em `app/dist-win/dbgate-<versão>-win_x64.exe`.

## Pré-requisitos

- Node.js 24 (testado com 24.21)
- Dependências instaladas na raiz do repositório (`yarn` / `npx yarn@1.22.22`)
- Visual Studio com C++ apenas se algum módulo nativo precisar ser recompilado; para x64 os binários
  pré-compilados (better-sqlite3, msnodesqlv8) são baixados automaticamente

O Yarn não precisa estar instalado globalmente: os comandos abaixo usam `npx yarn@1.22.22`
(Yarn 1, usado pelo monorepo). Se o `yarn` estiver no PATH, pode usar `yarn` direto.

## Passo a passo

Todos os comandos partem da raiz do repositório (`dbgate-minimal`).

### 1. Bibliotecas TypeScript e plugins

Necessário quando houve mudança em `packages/tools`, `datalib`, `sqltree`, `filterparser`, `rest` ou nos plugins:

```sh
npx yarn@1.22.22 build:lib
npx yarn@1.22.22 build:plugins:frontend
npx yarn@1.22.22 build:plugins:backend
```

### 2. API, frontend e cópia para o app

```sh
npx yarn@1.22.22 build:app:local
```

Copia os plugins para `plugins/dist`, compila a API (`packages/api/dist`) e o frontend
(`packages/web/public`) e copia tudo para `app/packages`.

### 3. Instalador

```sh
cd app
npx electron-builder --publish never --win nsis --x64 --config.directories.output=dist-win
```

Resultado em `app/dist-win`:

| Arquivo | Uso |
|---|---|
| `dbgate-<versão>-win_x64.exe` | instalador |
| `win-unpacked/DbGate.exe` | app sem instalar (para testar rápido) |
| `latest.yml`, `*.blockmap` | metadados de atualização automática |

## Observações

- **Não use `yarn build:app` para gerar o instalador local.** Ele usa a configuração completa de
  `app/package.json`, que inclui também ARM64 e `.zip`. O ARM64 precisa recompilar o `better-sqlite3`
  com as ferramentas ARM64 do Visual Studio e falha sem elas
  (`error MSB8020: ... ferramentas de compilação para v145`).
- O build reescreve `app/package.json` e `app/yarn.lock` com as dependências dos drivers de banco.
  Essas mudanças são geradas: não faça commit delas junto com outras alterações.
- Se um build for interrompido, verifique se ficou algum `7za.exe` ou `electron-builder` rodando
  (Gerenciador de Tarefas): eles travam os arquivos de saída e o próximo build falha.
