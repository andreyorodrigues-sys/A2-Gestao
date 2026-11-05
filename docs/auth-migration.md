# Autenticação e armazenamento privado — A2 Gestão

## Objetivo

Preparar autenticação para uma única conta proprietária (administrador). Não há contas de funcionários nem níveis de acesso. A aplicação publicada não é alterada nesta etapa.

## Situação encontrada

O branch `main` contém uma aplicação web concentrada em `index.html`, com dados persistidos no navegador por `localStorage`. Não foi encontrada integração ativa com Supabase/Firebase ou fluxo de login no arquivo principal. A tela de “Segurança e Backup” existente não equivale a autenticação no servidor.

## Arquitetura proposta

- Supabase Auth com e-mail e senha, recuperação de senha e encerramento de sessão.
- Tabela `public.a2_workspace`: uma linha por usuário autenticado, com `owner_id` como chave primária e o estado atual do A2 em JSONB.
- Row Level Security (RLS): somente a sessão cujo `auth.uid()` corresponde ao `owner_id` pode ler, inserir, atualizar ou excluir a linha.
- A chave pública/anon ou publishable pode ser usada no navegador somente com RLS habilitada e políticas testadas.
- A chave `service_role` e qualquer segredo administrativo nunca podem ser incluídos no HTML, JavaScript do navegador ou repositório.

## Por que começar com um workspace JSONB

A aplicação atual armazena módulos e cadastros em várias chaves locais. Um workspace JSONB permite migrar esse estado sem reescrever imediatamente todos os módulos para tabelas relacionais. É uma etapa de transição, não necessariamente o modelo definitivo: consultas analíticas, concorrência entre dispositivos e crescimento do volume podem justificar normalização posterior.

## Migração sem perda de dados

1. Fazer exportação integral do estado local atual e manter o backup original intacto.
2. Criar projeto Supabase e configurar URL + chave pública no ambiente de implantação (não commitar credenciais).
3. Executar `supabase/migrations/001_owner_workspace.sql` no projeto.
4. Criar a conta proprietária no Supabase Auth e ativar recuperação por e-mail.
5. Implementar tela de login e guarda de sessão; bloquear a interface enquanto não houver sessão válida.
6. Importar o snapshot local para `a2_workspace.payload`, associado ao UUID autenticado.
7. Ler de volta, comparar contagens e dados críticos (clientes, veículos, orçamentos, OS, pagamentos e despesas).
8. Só depois da validação, habilitar sincronização remota. Não apagar automaticamente o `localStorage`.
9. Testar sessão expirada, logout, recuperação de senha, acesso anônimo e tentativa de ler outra conta.

## Critérios de segurança

- Acesso anônimo negado.
- Usuário autenticado só acessa sua própria linha (RLS).
- Nenhuma senha é armazenada pelo A2; Supabase Auth administra credenciais e tokens.
- Tokens de sessão ficam sob gestão da biblioteca oficial do Supabase; não criar JWT manual.
- Nunca registrar senha, token ou chave secreta em logs.
- Backup exportável continua disponível; cópia local não substitui backup externo.
- O sistema deve avisar sobre falha de sincronização em vez de aparentar que salvou.

## Pendências antes de integrar e publicar

A integração funcional ainda depende de:
- URL do projeto Supabase.
- Chave pública (anon/publishable) desse projeto.
- Domínio/URL final para configurar redirecionamentos de login e recuperação.
- Confirmação de que o snapshot atual do navegador foi exportado antes da primeira migração.

Não colocar essas credenciais no GitHub. A URL e a chave pública podem ser configuradas como variáveis de build/implantação; a chave service_role não deve ser usada no frontend em hipótese alguma.

## Estado desta branch

Esta branch contém apenas a preparação documental e a migration SQL inicial. Nenhuma alteração foi feita no `main`, no deploy ou nos dados do navegador. A migration cria a estrutura e as políticas, mas não cria uma conta, não importa dados e não ativa login sozinha.
