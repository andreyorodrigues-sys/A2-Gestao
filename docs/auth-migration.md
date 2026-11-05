# Autenticação e armazenamento privado — A2 Gestão

## Objetivo

Manter o A2 Gestão como aplicação privada de uma única pessoa administradora. Não há cadastro de funcionários nem múltiplos níveis de acesso.

## Proprietário autorizado

- UUID Supabase Auth: `00803aaf-586d-47df-8eb7-a8948eb6490e`
- O frontend deve liberar a interface somente quando `session.user.id` corresponder exatamente a esse UUID.
- A migration também fixa o mesmo UUID nas quatro políticas RLS (SELECT, INSERT, UPDATE e DELETE). A proteção real dos dados remotos é aplicada no banco, não apenas no JavaScript.

## Arquitetura atual

- Supabase Auth com e-mail e senha, recuperação por e-mail e encerramento de sessão.
- Tabela `public.a2_workspace`: uma linha por proprietário, com `owner_id` como chave primária e estado do aplicativo em JSONB.
- Row Level Security (RLS): exige simultaneamente `auth.uid() = owner_id` e `auth.uid() = UUID_DO_PROPRIETARIO`.
- A chave pública/anon pode existir no navegador quando RLS está habilitada e corretamente testada.
- A chave `service_role` e qualquer segredo administrativo nunca podem ser incluídos no HTML, JavaScript do navegador ou repositório.

## Estado desta branch

- O login Supabase está integrado ao `index.html`, mas ainda NÃO é considerado uma barreira de segurança concluída.
- Na revisão estática, o script principal do aplicativo aparece e executa antes do script `A2_AUTH_GATE_V1`, que está próximo do fim do documento. Portanto, dados do `localStorage` podem ser lidos e carregados antes da validação da sessão.
- A classe CSS que esconde `.app` impede a interação visual normal, mas não protege os dados locais nem impede a execução prévia do JavaScript.
- A tela deve permanecer bloqueada para sessões ausentes ou para qualquer UUID diferente do proprietário; isso é um controle de interface, não uma proteção suficiente do armazenamento local.
- A migration SQL foi preparada com políticas RLS restritas ao UUID acima.
- A migration ainda precisa ser executada no projeto Supabase e testada.
- A aplicação ainda mantém os cadastros no `localStorage`; sincronização com a nuvem e importação de dados ainda não foram habilitadas.
- Nenhuma alteração deve ser feita em `main` ou no deploy publicado antes da revisão e autorização expressa.

## Migração sem perda de dados

1. No dispositivo que contém os dados atuais, gerar uma exportação integral pelo recurso de backup do A2 Gestão.
2. Guardar uma segunda cópia do arquivo fora do navegador. Não limpar o `localStorage`.
3. Confirmar no Supabase Auth que a conta proprietária existe e que o UUID corresponde exatamente ao UUID informado acima.
4. Executar `supabase/migrations/001_owner_workspace.sql` no SQL Editor do projeto Supabase correto.
5. Testar RLS com a conta proprietária e, separadamente, com uma segunda conta autenticada de teste. A segunda conta não pode ler nem gravar qualquer linha.
6. Testar login, sessão persistente, logout, sessão expirada e recuperação de senha.
7. Só depois de validar os testes, implementar exportação/importação para `a2_workspace.payload`.
8. Na importação, comparar contagens e registros críticos (clientes, veículos, orçamentos, OS, pagamentos, despesas e configurações) antes de habilitar sincronização.
9. Manter backup local e remoto; falhas de sincronização devem ser informadas claramente, nunca apresentadas como salvamento concluído.

## Limites e segurança

- A autenticação do frontend atual ainda não impede de forma confiável a execução da aplicação antes do login: o script principal roda antes do gate. Não apresentar esta implementação como segurança concluída.
- O `localStorage` do navegador não é armazenamento criptografado. Quem tiver acesso ao perfil do navegador/dispositivo poderá inspecionar os dados locais.
- A revisão técnica detalhada e os bloqueios de aceite estão em `docs/security-review.md`.
- A RLS protege a tabela remota mesmo que alguém ignore a tela de login e tente chamar a API diretamente.
- Nunca armazenar senha no A2 nem criar JWT manualmente.
- Tokens ficam sob gestão da biblioteca oficial do Supabase.
- Nunca registrar senha, token ou chave secreta em logs.
- Não usar `service_role` no frontend.
- Não importar nem sincronizar dados automaticamente antes de testar backup, restauração, RLS e recuperação.

## Critérios de aceite antes de publicar

- UUID correto consegue entrar.
- Outro UUID autenticado é bloqueado no frontend e não acessa dados via RLS.
- Usuário anônimo não acessa a tabela.
- Logout e recuperação de senha funcionam.
- Backup e restauração preservam todos os módulos e lançamentos.
- Sincronização não duplica registros nem sobrescreve dados locais sem confirmação.
- PR revisada e aprovada; publicação só com autorização expressa.
