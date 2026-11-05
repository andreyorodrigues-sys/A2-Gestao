# Revisão de segurança — A2 Gestão

## Escopo

Revisão estática da branch `feature/auth-admin-single-user`. Nenhuma migration foi executada, nenhum dado foi restaurado e a versão publicada não foi alterada.

## Achado crítico: gate de autenticação executa tarde

No `index.html`, o script principal do aplicativo começa aproximadamente na região do documento em que são declaradas as chaves `A2_KEYS`, carregadas as coleções do `localStorage` e inicializadas as funções de negócio. O script `A2_AUTH_GATE_V1` aparece muito depois, próximo do fim do arquivo.

Consequências:
- O JavaScript principal pode ler e manter dados locais em memória antes do login.
- A regra CSS que aplica `visibility:hidden` e `pointer-events:none` à interface não interrompe a execução dos scripts.
- A validação de `session.user.id` controla a liberação visual da interface, mas não protege os dados locais de alguém que consiga inspecionar o perfil do navegador ou executar código no contexto da página.

**Classificação:** bloqueador para declarar a autenticação do frontend como concluída ou publicar a branch como solução de segurança.

## Correção arquitetural necessária

Não basta mover apenas o bloco visual do login para o início do HTML. O carregamento e a inicialização do aplicativo que leem dados locais precisam aguardar uma sessão autenticada e a confirmação do UUID autorizado.

A correção deve:
1. Exibir uma tela de bloqueio desde o início do carregamento, sem flash da aplicação.
2. Carregar/inicializar os módulos do aplicativo somente depois de validar a sessão e o UUID proprietário.
3. Impedir que callbacks, rotinas automáticas e listeners de negócio executem antes da autorização.
4. Manter a RLS como controle efetivo para qualquer dado remoto.
5. Não colocar `service_role`, senhas ou segredos no cliente.
6. Tratar falha de rede/Auth como bloqueio, sem liberar a aplicação por fallback.

Uma simples mudança de CSS ou a ocultação do menu não atende a esses requisitos.

## Outros controles pendentes

- Executar a migration somente após confirmação do projeto e revisão final do SQL.
- Testar SELECT/INSERT/UPDATE/DELETE com proprietário, usuário autenticado diferente e usuário anônimo.
- Testar sessão ausente, expirada, renovação, logout e recuperação de senha.
- Testar a restauração em perfil de navegador isolado, com backup prévio e comparação de contagens, relacionamentos e imagens.
- Verificar se os dados financeiros ausentes no backup são esperados antes de qualquer migração.
- Resolver ou documentar a relação divergente entre o orçamento de R$ 600 e a OS A2-0001 de R$ 350, sem alterar automaticamente os valores.

## Critérios para liberar a próxima etapa

- [ ] Inicialização do app bloqueada até autenticação válida.
- [ ] Nenhum dado de negócio lido antes da autorização.
- [ ] RLS testada com três contextos (proprietário, outra conta, anônimo).
- [ ] Login/logout/recuperação testados.
- [ ] Backup V9 validado no próprio navegador sem restaurar.
- [ ] Restauração testada em ambiente isolado.
- [ ] Divergências de orçamento/OS explicadas.
- [ ] Aprovação expressa antes de mesclar ou publicar.

## Estado desta revisão

A revisão é estática. Não houve teste de navegador, não houve execução de SQL e não houve alteração de produção. A autenticação permanece bloqueada para publicação até a correção arquitetural e os testes acima.


## Confirmação do proprietário — orçamento/OS A2-0001

O proprietário confirmou que o valor correto a preservar é **R$ 600,00**, conforme o orçamento aprovado. Portanto, a OS A2-0001 não deve permanecer em R$ 350,00.

A correção de dados ainda não foi aplicada. Antes de editar o backup ou implementar reparo automático, conferir a composição dos serviços na OS: o orçamento registra “Higienização + Polimento (lojista)” por R$ 600, enquanto a OS registra “Higienização Detalhada” por R$ 350. Não atualizar apenas o total e deixar a soma dos itens divergente.

Correção esperada após validar a regra de composição:
- preservar o total aprovado de R$ 600,00 na OS;
- alinhar o vínculo reverso `budget.orderId` ao ID real da OS `musvw8195ndj9`, mantendo `order.budgetId` apontando para o orçamento `musvw5fahndn9`;
- manter o backup original intocado e gerar uma cópia corrigida separada, com novo checksum e relatório de alterações;
- não sobrescrever dados de produção nem importar automaticamente.


### Cópia de backup corrigida — sem importação

Foi gerada uma cópia separada do arquivo enviado, mantendo o original intacto. Nessa cópia, a OS A2-0001 foi alinhada ao orçamento aprovado:
- Total da OS: R$ 600,00.
- Serviço e composição copiados do orçamento: “Higienização + Polimento (lojista)”.
- `budget.orderId` alinhado ao ID real da OS.
- `order.budgetId` preservado apontando para o orçamento.
- Checksum FNV-1a-32 recalculado e verificado: `e58df348`.

A cópia corrigida ainda NÃO foi importada no aplicativo nem no Supabase. O arquivo contém os dados originais do restante do backup; a única alteração de conteúdo foi a correção da relação orçamento/OS A2-0001 e seu valor/composição correspondentes.
