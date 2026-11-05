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
