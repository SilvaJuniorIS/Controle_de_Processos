# Publicar o AtlasNex Fluxo na Vercel

O código está adaptado para funções Node.js 24 na Vercel. A publicação e a conexão real com Neon ainda dependem de contas e credenciais do proprietário. Não há deploy público confirmado.

## Arquitetura

- `public/`: interface estática.
- `api/index.js`: entrada da API; `vercel.json` encaminha `/api/*` para essa função.
- `DATABASE_URL`: conexão Postgres **Neon** usada por HTTPS pelo driver `@neondatabase/serverless`. Esta implementação não aceita qualquer provedor Postgres via TCP.
- `APP_PASSWORD`: senha forte de pelo menos 16 caracteres para um espaço privado compartilhado. Sessão assinada de 8 horas, cookie HttpOnly, Secure na Vercel e SameSite=Strict. Não há contas individuais nem múltiplas organizações.
- Sem `DATABASE_URL`, o desenvolvimento local continua usando SQLite. Na Vercel, a aplicação **recusa** o fallback para arquivos temporários.

## Preparar as contas

1. Crie/acesse sua conta na Vercel. Crie o projeto com o nome sugerido `atlasnex-fluxo` (sujeito à disponibilidade). Pode usar a CLI abaixo para enviar este diretório sem depender de push no GitHub.
2. No Marketplace/Storage da Vercel, crie ou conecte uma base Neon Postgres. Não contrate recursos pagos sem revisar os limites e preços do provedor. Configure `DATABASE_URL` nas variáveis do projeto para Production. Se a integração usar outro nome, adicione `DATABASE_URL` com a conexão Neon apropriada pelo painel seguro.
3. Adicione `APP_PASSWORD` como variável sensível do projeto para Production. Use uma senha aleatória forte, com pelo menos 16 caracteres. Não a envie em chat nem a grave no repositório. Guarde-a em seu gerenciador de senhas.
4. Mantenha o framework como **Other**, Node.js **24.x** e as configurações de build de `vercel.json`. O build executa a validação e a migração idempotente das tabelas `processes` e `field_notes`; não apaga registros existentes.

Para usar Preview, configure também as duas variáveis nesse ambiente e, preferencialmente, use uma branch Neon separada da base de produção. Não deixe previews escreverem silenciosamente na base real.

## Enviar pela CLI

Depois de instalar Node.js 24 e autorizar sua própria conta:

```sh
cd /workspace/Controle_de_Processos
npm ci
npm test
npm run build
npx vercel@65.5.0 login
npx vercel@65.5.0 project create atlasnex-fluxo
npx vercel@65.5.0 link --project atlasnex-fluxo
```

Configure o banco e a senha no painel antes da etapa final:

```sh
npx vercel@65.5.0 deploy --prod
```

Se o projeto já existir, omita `project create`. Se pertencer a uma equipe, selecione a equipe correta no vínculo. A URL real vem da resposta da Vercel; não presuma disponibilidade de um domínio específico.

Para o agente publicar a partir deste ambiente, é necessário liberar `api.vercel.com` e `vercel.com` e fornecer autenticação Vercel por meio seguro. `*.vercel.app` é necessário para validar a URL resultante. A autorização está ausente na configuração original; nenhuma senha ou token deve ser informado no chat. Um token `VERCEL_TOKEN` pode ser disponibilizado pelas configurações seguras do ambiente, com destino `api.vercel.com`. A autenticação GitHub disponível não substitui autorização na Vercel.

## Validar depois do deploy

1. Aguarde o status **Ready** na Vercel e abra a URL efetivamente retornada.
2. Confira que a leitura de `/api/processes` sem sessão retorna 401 e que a tela pede senha.
3. Entre com a senha configurada. O indicador deve exibir “Banco na nuvem”.
4. Crie um processo fictício de validação, registre um andamento, edite a prioridade e recarregue a página. Confirme que o histórico e os dados permanecem.
5. Saia e confirme que a API volta a exigir login. Entre novamente e exclua somente o processo de validação.
6. Confirme em `/api/health`, com a sessão autenticada, `status: ok`, `storage: postgres` e `private: true`.

A base SQLite local não é enviada nem importada automaticamente. Se houver dados locais, preserve-os e planeje a importação separadamente. O segredo assina as sessões: alterá-lo invalida as sessões atuais. Sair remove o cookie daquele navegador; não revoga cópias de uma sessão já emitida até sua expiração. Para revogação geral imediata, altere `APP_PASSWORD` e publique novamente.

## Evidência e limites

Os testes cobrem o fluxo SQLite, a autenticação e as consultas Postgres executadas por um motor Postgres WASM local (PGlite), através do contrato HTTP do SDK Neon. Isso valida o SQL e o adaptador, mas **não** comprova acesso a uma conta Neon real nem um deploy na Vercel. A confirmação final depende da sequência acima.

Esta publicação é para piloto privado. Antes de comercializar para equipes, implemente contas individuais, autorização por organização, política e testes de backups, auditoria e limites de uso adequados. O acesso por senha compartilhada não atribui cada alteração a uma pessoa.
