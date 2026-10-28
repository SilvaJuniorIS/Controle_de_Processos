# AtlasNex Fluxo

**Sua mesa, sob controle.** Uma ferramenta do universo AtlasNex para transformar processos recebidos em próximas ações claras.

## Desenvolvimento local

Requer Node.js 24.x. Instale as dependências com o lockfile:

```sh
cd /workspace/Controle_de_Processos
npm ci
npm start
```

O servidor escuta em `127.0.0.1`, porta 3000. `npm run dev` reinicia ao alterar arquivos. `PORT`, `HOST` e `DB_PATH` permitem configurar a instância. Sem `DATABASE_URL`, usa SQLite integrado; sem `APP_PASSWORD`, o acesso local não exige senha. Defina senha forte de pelo menos 16 caracteres para proteger um espaço local. Não exponha a instância sem proteção.

```sh
npm test
npm run build
```

Os testes usam bases temporárias isoladas. Incluem API SQLite, autenticação, entrada de função Vercel e consultas Postgres contra PGlite. Não acessam produção nem confirmam conectividade com um banco Neon real. O build local verifica os arquivos e a sintaxe. O deploy Vercel executa também a migração do banco configurado.

## Publicação na Vercel

Consulte [DEPLOY.md](DEPLOY.md) para configurar um projeto Vercel, conectar Neon e publicar pela CLI. São necessárias as variáveis **DATABASE_URL** (conexão Neon) e **APP_PASSWORD** (senha forte, no mínimo 16 caracteres), configuradas pelo painel seguro. Nunca coloque os valores no Git ou no chat.

A interface é estática; `/api/*` usa uma função Node.js. A versão Vercel recusa iniciar a API sem senha segura e nunca usa SQLite temporário como fallback. O build cria a tabela e o índice de unicidade de forma idempotente. Os registros locais não são enviados automaticamente ao banco remoto.

O espaço é protegido por uma senha compartilhada e cookie de sessão assinado com duração de 8 horas. Ainda não há contas individuais, isolamento entre organizações ou auditoria por pessoa. O piloto privado não substitui esses requisitos para uma oferta comercial a equipes.

## Funcionalidades

- Cadastro e edição de número, ano, objeto, data e motivo da entrada, origem, responsável, categoria, situação, prioridade, providência, prazo e observações.
- Painel de processos ativos, vencidos, aguardando retorno e concluídos; radar de prazos e providências ordenadas por vencimento.
- Histórico de entrada, andamentos e alterações. Conclusão e reabertura pela edição da situação, preservando histórico.
- Busca, filtros, exportação CSV e exclusão com confirmação.
- Demonstração opcional com seis processos fictícios identificados e remoção separada dos exemplos.
- Interface responsiva sem fontes ou serviços visuais externos.
- Postgres e SQLite com unicidade de número/ano e detecção de conflito de gravação. Edições pela interface enviam a versão lida e recusam substituir uma versão mais nova.

## Diário de campo

No menu **Diário de campo**, use **Nova anotação** para criar uma entrada independente com assunto, data e texto livre. É possível manter vários assuntos no mesmo dia sem misturá-los. As entradas aparecem agrupadas por data, com busca no assunto/texto e filtro por dia.

Cada entrada pode ser lida, editada ou excluída separadamente. Há confirmação antes de descartar texto não salvo ou excluir uma anotação, e detecção de conflito se outra janela atualizar a mesma entrada. O diário utiliza o mesmo acesso privado do espaço e não depende de nenhum processo. Não é uma conta pessoal separada: quem tem a senha do espaço acessa suas anotações.

As notas ficam na tabela `field_notes` do mesmo banco usado pelo espaço, preservando quebras de linha. A migração adiciona essa tabela sem apagar os processos. A exportação CSV de processos não inclui o diário; o backup completo do banco preserva ambos. O texto é salvo ao clicar em **Salvar anotação**; não há salvamento automático de rascunhos.

## Persistência e limites

Localmente, os registros ficam em `data/fluxo.sqlite` (ignorado pelo Git). Para um backup simples e consistente, pare o servidor, copie a pasta `data/` inteira para um destino seguro e reinicie. O SQLite usa WAL: não copie somente o arquivo principal durante gravações. Restaure com o servidor parado e teste antes de descartar o original.

Na Vercel, os registros ficam no Neon. Configure retenção e backups no provedor e teste a recuperação. O CSV exporta os campos atuais, não o histórico completo e não substitui um backup.

Datas e alertas seguem o dia de São Paulo. “Precisam de atenção” conta processos ativos com prazo vencido. Prioridade é definida pelo usuário. A senha compartilhada não identifica a autoria de cada alteração; o histórico não é inviolável. A exclusão remove processo e histórico.

Ainda não há anexos, notificações, contas individuais, integração FiscalBot ou operação comercial completa. Veja [PRODUTO.md](PRODUTO.md) para posicionamento e evolução.
