# Ambiente de testes isolado — A2 Gestão

## Objetivo
Manter uma linha de testes separada da versão publicada V16 e da branch principal. Esta branch foi criada a partir de `feature/auth-admin-single-user` para concentrar a validação de autenticação, restauração de backup e regressões sem alterar a produção.

## Identificação
- Branch de testes: `test/isolated-restore-auth`
- Branch de desenvolvimento de origem: `feature/auth-admin-single-user`
- Produção: V16 — preservada, sem alterações.
- Pull request existente: permanece independente; nenhuma mesclagem foi realizada.

## Regras de isolamento
1. Não fazer merge desta branch em `main` nem na branch de produção sem aprovação expressa.
2. Não publicar sobre o domínio/URL usado pela V16.
3. Não executar migrations no projeto Supabase de produção.
4. Não habilitar sincronização com dados reais.
5. Não importar backups de clientes em hospedagem pública ou em repositório Git.
6. Usar perfil de navegador separado e dados fictícios para testes funcionais.
7. Manter o backup original e a cópia corrigida fora do Git.
8. Falha de autenticação, rede ou autorização deve manter o aplicativo bloqueado.

## Etapas de validação
- [ ] Identificar hospedagem e criar preview separado, sem domínio de produção.
- [ ] Configurar projeto Supabase de teste separado, sem reutilizar credenciais de produção.
- [ ] Corrigir a inicialização: nenhum módulo de negócio ou leitura de dados locais antes de autenticação e validação do UUID autorizado.
- [ ] Testar sessão ausente, inválida, expirada, renovada e logout.
- [ ] Testar RLS com proprietário de teste, outro usuário autenticado e usuário anônimo.
- [ ] Validar importação do backup corrigido em perfil isolado e sem conexão com produção.
- [ ] Conferir categorias, quantidades, relacionamentos, imagens e checksum.
- [ ] Testar os fluxos de orçamento, OS e financeiro para impedir duplicidade e divergências.
- [ ] Registrar evidências e resultados antes de qualquer decisão de publicação.

## Estado inicial
A branch de testes foi criada. Isso isola o código-fonte, mas ainda não representa uma URL de teste publicada nem um ambiente Supabase separado. Nenhum deploy, migration, importação ou sincronização foi executado. A versão V16 permanece intacta.

## Critério de encerramento
O ambiente só poderá ser considerado pronto quando houver hospedagem de preview independente, backend de teste separado, autenticação validada, restauração testada e evidências documentadas. A publicação da versão final continua dependendo de aprovação expressa.

## Bloqueio antes de publicar o preview

A inspeção do `index.html` desta branch confirmou que o endereço e a chave pública do projeto Supabase atualmente configurado estão embutidos no código do navegador. A chave pública não substitui as políticas RLS e não é uma chave administrativa, mas o endereço aponta para o projeto atualmente configurado. Portanto, publicar esta cópia sem trocar a configuração poderia fazer o preview conversar com o backend de produção.

**Não publicar o preview ainda.** Antes, criar um projeto Supabase exclusivo para testes, configurar URL e chave pública de teste por configuração própria do ambiente e confirmar que nenhuma operação do preview alcança o projeto de produção. Não copiar senha, token de sessão nem chave `service_role` para o repositório.


## Auditoria técnica do carregamento do aplicativo

Na revisão do arquivo `index.html` da branch de testes:
- O arquivo tem 2.955 linhas e aproximadamente 432 KB.
- Foram identificados 13 elementos `<script>` reais no HTML: 12 blocos inline de funcionalidades e o bloco inline de autenticação. Um trecho adicional com `<script>` aparece dentro de uma string/template de HTML para geração de PDF e não é executado como elemento da página atual.
- O bloco `A2_AUTH_GATE_V1` está no final do documento (linha 2.869), depois dos blocos que inicializam funcionalidades.
- Há leituras e gravações de `localStorage` em blocos anteriores ao gate, incluindo leitura de configurações e dados, backup e renderização.
- Portanto, ocultar a interface por CSS não impede a execução desses scripts nem o acesso aos dados locais.

### Correção necessária antes do preview

A refatoração deve transformar o gate em ponto único de entrada:
1. O HTML pode carregar a estrutura visual mínima de autenticação, estilos e dependências estritamente necessárias ao login.
2. Nenhum script de negócio deve executar automaticamente antes da autenticação.
3. Depois de confirmar sessão válida e o UUID do proprietário autorizado, o gate carrega o código principal.
4. Se autenticação, rede ou autorização falhar, o código principal não é carregado.
5. A configuração do backend de teste deve ser injetada separadamente da produção. A URL e a chave pública do Supabase de produção não podem permanecer no artefato de preview.
6. A mudança deve preservar a ordem atual dos scripts de negócio e ser validada com testes de regressão antes de importar qualquer backup.

**Decisão de segurança:** não fazer uma substituição mecânica de tags `<script>` sem validar escopos, ordem de execução, eventos `DOMContentLoaded`, dependências globais e scripts externos. O código atual é um HTML monolítico; a extração precisa ser feita e testada como refatoração controlada.


## Progresso aplicado na branch de testes

- Criado `config.js` com campos vazios para URL, chave pública (`anonKey`) e UUID do proprietário do Supabase de teste.
- O `index.html` agora lê essas três configurações de `window.A2_SUPABASE_CONFIG`, em vez de carregar a URL, a chave pública e o UUID do projeto de produção.
- Se qualquer campo estiver vazio, o gate mantém o acesso bloqueado e não inicializa o cliente Supabase.
- Foi verificado no conteúdo atualizado que a URL/ref do projeto de produção e o UUID de produção não permanecem no `index.html` da branch de testes.

**Ainda não é um preview pronto para uso.** A configuração está intencionalmente vazia e o problema estrutural de scripts de negócio executarem antes do gate continua pendente. O próximo passo de código é extrair/carregar o aplicativo somente após a autorização, preservando a ordem e testando dependências. Depois disso, ainda será necessário criar o projeto Supabase exclusivo, preencher `config.js` somente com os dados desse projeto e configurar uma hospedagem de preview independente.


## Migration RLS específica para testes

Foi adicionada `supabase/test/001_owner_workspace_test.sql` como modelo separado. Ela usa o marcador `__TEST_OWNER_UUID__`, que deverá ser substituído pelo UUID do usuário administrador criado no Supabase de teste. Assim, a migration de teste não herda o UUID fixo da conta de produção presente em `supabase/migrations/001_owner_workspace.sql`.

A migration-template não foi executada. Não há projeto Supabase de teste conectado nem schema aplicado. Antes de executar, confirmar o UUID da conta de teste, substituir o marcador, revisar o SQL e conferir visualmente o projeto selecionado no painel Supabase. A migration original de produção permanece intocada e também não foi executada.
