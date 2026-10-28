# Publicação e atualização na Vercel

A aplicação usa frontend estático, função Node.js 24 e Neon Postgres por HTTPS. A configuração está em `vercel.json`; `/api/*` aponta para `api/index.js`.

## Variáveis do projeto

Configure pelo painel seguro da Vercel, em Production:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão Postgres Neon |
| `APP_PASSWORD` | Senha de ativação da primeira conta, mínimo de 16 caracteres. Em instalações existentes, use a senha compartilhada atual. |

Não coloque valores no Git nem no chat. Se o projeto já tem essas variáveis, não é necessário criar um novo serviço de autenticação ou fornecer novas chaves. Para desenvolvimento local, a mesma senha de ativação deve ser definida pelo operador; sem DATABASE_URL usa SQLite. Não use um banco de produção para testes locais.

## Atualizar a instalação existente

1. Preserve um backup/restauração do banco Neon antes da atualização. Não use o CSV como backup completo.
2. O push na branch de produção dispara o deploy Vercel quando a integração Git está habilitada. Aguarde o novo commit ficar **Ready**.
3. O build executa `npm run build && npm run db:migrate`. A migração é transacional e idempotente: cria tabelas de usuários, sessões, convites, recuperação e limites; renomeia `processes` e `field_notes` para `private_processes` e `private_field_notes`; adiciona proprietários e unicidade de número/ano por usuário. Os registros são preservados e ficam inacessíveis até serem assumidos pela primeira conta.
4. O proprietário abre a URL de produção e cria sua primeira conta com **nome, e-mail, senha de ativação atual e nova senha pessoal**. Essa transação vincula os registros legados à conta e só pode acontecer uma vez. A senha de ativação deve permanecer conhecida apenas pelo proprietário até esse passo.
5. Guarde os códigos de recuperação exibidos. Depois confira seus processos e diário existentes. Os próximos acessos usam e-mail e senha pessoal.
6. Para convidar outra pessoa, clique no seu nome no menu, informe o e-mail e gere um link. A pessoa cria sua própria conta por esse link e começa com processos/diário vazios.

**Compatibilidade:** cookies e login compartilhado antigos não são aceitos. A renomeação também bloqueia consultas das funções de versões anteriores aos dados privados. Durante a migração, versões antigas podem ficar indisponíveis. Não restaure um deploy anterior a 0.4 sobre a base migrada: ele usa nomes de tabelas e autenticação incompatíveis. O caminho de recuperação deve preservar o banco e corrigir/avançar a versão, ou restaurar uma cópia consistente de banco e aplicação em ambiente isolado e autorizado.

## Publicação inicial pela CLI

Depois de criar sua própria conta Vercel, conecte Neon pelo Marketplace/Storage ou pelo painel Neon e configure as duas variáveis acima. Framework **Other**, Node.js **24.x**, configurações de build de `vercel.json`.

```sh
cd /workspace/Controle_de_Processos
npm ci
npm test
npm run build
npx vercel@65.5.0 login
npx vercel@65.5.0 project create atlasnex-fluxo
npx vercel@65.5.0 link --project atlasnex-fluxo
npx vercel@65.5.0 deploy --prod
```

Omita `project create` se o projeto já existir. Se estiver numa equipe, selecione a equipe correta. A URL válida é a efetivamente retornada pela Vercel. Para o agente operar daqui, são necessários acesso de rede a `api.vercel.com` e `vercel.com`, autenticação Vercel por meio seguro e acesso à URL final. O token GitHub não substitui autorização Vercel. Essa conexão pode continuar indisponível neste ambiente; o push confirmado não comprova que o deploy terminou.

## Validar em produção

- Sem sessão, `/api/processes`, `/api/notes` e `/api/health` devem retornar 401. `/api/auth/status` só informa se a ativação é necessária e os dados públicos da própria sessão, quando houver.
- Ative a primeira conta, guarde os códigos e confira que seus dados antigos foram preservados.
- Crie um registro fictício, atualize a página e verifique sua persistência. Faça o mesmo no diário.
- Convide uma segunda conta e abra o convite em outro perfil do navegador/janela privada. Ela deve começar sem acesso aos dados da primeira, inclusive ao tentar um ID direto. Um processo com número/ano iguais é permitido em outra conta.
- Logout deve invalidar a sessão no servidor. Use os códigos de recuperação apenas quando necessário: são consumidos uma vez e encerram as sessões anteriores.
- Depois da validação, remova apenas os registros fictícios que você criou.

Para Preview, use uma base Neon separada da produção. A migração modifica o esquema; não deixe builds de teste alterarem a base real. Ainda não há compartilhamento, contas de equipe, envio/verificação de e-mail ou integração FiscalBot. O administrador de convites não possui uma tela de acesso aos processos de outras pessoas.
