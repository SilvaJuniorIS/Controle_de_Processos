# AtlasNex Fluxo

**Sua mesa, sob controle.** Acompanhamento de processos e diário de campo, agora com contas individuais.

## Desenvolvimento

Requer Node.js 24.x. Use o checkout existente; cada tarefa de nuvem já é isolada.

```sh
cd /workspace/Controle_de_Processos
npm ci
npm test
npm run build
npm start
```

O servidor escuta em `127.0.0.1:3000`. Configure `APP_PASSWORD` pelo ambiente seguro antes de criar a primeira conta: mínimo de 16 caracteres. Ela é a senha de **ativação inicial**, não o login diário. Não há mais acesso anônimo local. O servidor não carrega `.env` automaticamente; Node 24 permite `node --env-file=.env server.js` quando esse arquivo ignorado já existe com valores definidos pelo proprietário. Não versione nem compartilhe os valores.

Sem `DATABASE_URL`, usa SQLite em `data/fluxo.sqlite`. Com `DATABASE_URL`, usa Neon Postgres por HTTPS. `PORT`, `HOST` e `DB_PATH` configuram a instância local. `npm run dev` reinicia ao editar arquivos.

## Primeira conta e registros existentes

1. Abra a aplicação atualizada e preencha nome, e-mail, a senha de ativação atual (`APP_PASSWORD`) e uma nova senha pessoal de pelo menos 12 caracteres.
2. A primeira conta torna-se administradora de convites. Os processos e as anotações legadas sem proprietário são vinculados a ela na mesma transação que cria a conta. A primeira ativação só pode acontecer uma vez.
3. Guarde os quatro códigos de recuperação exibidos uma única vez. Cada código pode redefinir a senha uma vez. Não há envio automático de e-mail.
4. Nos próximos acessos, entre com seu e-mail e sua senha pessoal. A senha de ativação não autentica usuários nem permite recuperar uma conta já criada.

**Apenas o proprietário deve realizar a primeira ativação.** Não compartilhe a antiga senha de ativação com convidados. Não deixe outra pessoa realizar a primeira ativação em seu lugar: essa conta assumirá os dados anteriores.

## Contas e privacidade

- Cada conta tem seus próprios processos, providências, painel, exportações e diário. O mesmo número e ano de processo pode existir em contas diferentes.
- A propriedade é uma coluna separada no banco, definida pelo usuário autenticado no servidor. O campo descritivo “Responsável” do formulário não concede acesso nem transfere propriedade.
- Todas as consultas, gravações e exclusões de registros incluem o proprietário. Tentativas de acessar IDs de outra conta retornam 404, inclusive para o administrador da aplicação.
- O administrador pode gerar convites em **Sua conta**, acessível pelo nome na parte inferior do menu. O link vale por sete dias, é destinado ao e-mail informado e pode ser usado uma vez. O proprietário envia esse link por seu próprio canal; a aplicação não envia mensagens automaticamente.
- Não há cadastro público, compartilhamento, transferências entre contas ou acesso da função administrativa aos trabalhos dos demais. O operador do banco/infraestrutura ainda possui acesso técnico aos dados; o isolamento descrito é o da aplicação, não criptografia de ponta a ponta ou RLS por conexão.
- Os e-mails são identificadores de login normalizados, sem verificação por envio de mensagem. O convite controla o cadastro.

## Senhas, sessões e recuperação

Senhas usam scrypt com salt aleatório; sessões de 8 horas e códigos de recuperação são armazenados somente por digest SHA-256. O cookie é HttpOnly, SameSite=Strict e Secure na Vercel. A sessão é consultada no banco a cada requisição. Logout revoga a sessão no servidor. Recuperar ou alterar a senha revoga as sessões anteriores. A troca de senha mantém apenas uma nova sessão no navegador atual.

A recuperação exige e-mail, um código de uso único e uma nova senha. Não há recuperação por `APP_PASSWORD`, botão administrativo para ler senhas ou envio de e-mail. Se perder senha e todos os códigos, será necessário um procedimento operacional autorizado no banco. Guarde os códigos em gerenciador de senhas. Tentativas de autenticação e recuperação são limitadas por identidade/origem no banco, por janelas de 15 minutos.

## Processos e diário

Cadastro, edição, situações, prioridades, prazos, histórico e exportação CSV continuam disponíveis. Novas entradas e movimentações de processos registram a identidade da conta autenticada; registros legados sem autoria permanecem assim. O diário oferece entradas com assunto/data/texto, agrupamento por dia, busca e filtro. Só salva ao clicar em **Salvar anotação**; não há salvamento automático. O CSV exporta processos da conta atual, sem incluir diário ou histórico completo.

Datas e alertas seguem São Paulo. O histórico não é inviolável. Exclusão exige confirmação e é permanente. Ainda não há anexos, notificações, integração FiscalBot ou colaboração entre usuários.

## Migração e publicação

Consulte [DEPLOY.md](DEPLOY.md). A migração Postgres acontece em transação durante o build Vercel. SQLite migra ao abrir a base. As tabelas antigas `processes` e `field_notes` são **renomeadas**, preservando seus registros, para `private_processes` e `private_field_notes`, e recebem a coluna `owner_id`. Isso impede que funções de versões antigas continuem consultando a coleção completa pelo nome antigo. A API antiga perde compatibilidade; não reverta para versões anteriores a 0.4 após a migração sem um plano de restauração. A senha compartilhada e cookies antigos deixam de dar acesso.

Faça um backup consistente antes de atualizar uma base importante. Localmente, pare o servidor e copie a pasta `data/` inteira (SQLite usa WAL). No Neon, configure backup/retenção e teste a restauração com o provedor. O banco local não é enviado automaticamente à nuvem.

## Validação

`npm test` utiliza bases descartáveis e contas fictícias, cobrindo migração de legado, isolamento entre contas, acesso direto a IDs, convites, senhas, recuperação, revogação, conflitos e CRUD. O adaptador Neon é exercitado contra PostgreSQL WASM (PGlite); isso não comprova conectividade de uma conta Neon real. A função Vercel aceita corpo JSON já interpretado pela plataforma. O teste no navegador também verifica dois usuários, convites e recuperação.

Veja [PRODUTO.md](PRODUTO.md) para a direção comercial. Contas individuais são um passo funcional; validação de segurança independente, operação de backups e requisitos contratuais continuam necessários para comercialização.
