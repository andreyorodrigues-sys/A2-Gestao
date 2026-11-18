# A2 Gestão — plano seguro de migração do armazenamento

## Estado auditado
- Branch: `dev/a2-gestao-consolidada`
- Baseline preservado: `index_backup_v10.html`
- A aplicação é um HTML único com scripts clássicos inline e funções globais.
- A inicialização lê dados de forma síncrona através de `a2ReadRaw()` / `read()`.
- O salvamento principal `saveAll()` escreve as 17 coleções diretamente no `localStorage`.
- A extensão V9 mantém mais 3 coleções (`a2inventory`, `a2stockMoves`, `a2approvals`) e também as grava diretamente no `localStorage`.
- O backup/restauração V9 é uma segunda implementação que sobrescreve as funções de backup da versão base.
- Há 15 blocos de script no HTML e cerca de 45 chamadas diretas de operações de armazenamento encontradas na auditoria.
- Fotos de vistoria estão aninhadas em registros de OS; portanto, a migração precisa tratar também referências e conteúdo binário das imagens.

## Decisão técnica
Não substituir chamadas individuais de `localStorage` por chamadas assíncronas de IndexedDB de maneira mecânica. O código atual depende de leitura síncrona e de estado global inicializado durante a execução dos scripts. Uma substituição parcial pode fazer o app abrir com coleções vazias, salvar somente parte dos dados ou exibir sucesso antes da gravação terminar.

A camada nova deverá oferecer:
1. IndexedDB como armazenamento primário para coleções e fotos.
2. Uma inicialização explícita que conclua leitura, migração e verificação antes de liberar a interface para edição.
3. Escritas transacionais e confirmação de conclusão antes de mostrar mensagens de sucesso.
4. Um único fluxo de backup/restauração que inclua as 20 coleções, configurações e fotos.
5. Importação em área temporária, validação de estrutura e checksum, contagem de registros e verificação de imagens antes de promover os dados importados.
6. Migração não destrutiva: manter o armazenamento antigo intacto até confirmar que os dados novos podem ser lidos de volta.
7. Exportação manual JSON compatível com os backups atuais, sem exigir nuvem ou mensalidade.

## Sequência obrigatória de implementação e testes
- [ ] Criar uma cópia de teste isolada sem alterar produção.
- [ ] Implementar e testar o repositório IndexedDB e suas transações.
- [ ] Adaptar a inicialização para aguardar a hidratação do banco antes de liberar a aplicação.
- [ ] Adaptar salvamento, configurações, fotos, backup, restauração e extensões V9.
- [ ] Testar migração com dados antigos e fotos, incluindo interrupção/erro durante a migração.
- [ ] Testar restauração com arquivo grande e simular falha de quota/armazenamento.
- [ ] Conferir contagens, checksum, vínculos cliente-veículo-OS e abertura das imagens.
- [ ] Só então gerar preview e solicitar validação no iPhone.
- [ ] Não promover para produção sem autorização expressa.

## Riscos que não podem ser mascarados
- IndexedDB também usa o espaço físico do dispositivo e não é armazenamento em nuvem.
- A conversão de fotos Base64 em blobs pode exigir espaço temporário adicional durante a migração.
- A restauração não pode depender de rollback gravado no mesmo armazenamento que acabou de falhar.
- O backup JSON externo do usuário continua sendo a proteção independente mais importante.

## Auditoria adicional dos pontos de acesso (18/11/2026)

A revisão estática do `index.html` encontrou 44 chamadas explícitas a métodos de `localStorage` (incluindo leituras, gravações, remoções e enumeração). Os principais pontos que precisam ser migrados juntos são:

| Área | Comportamento atual | Risco se migrar só parte |
|---|---|---|
| Bootstrap / leitura | `a2ReadRaw()` e `read()` fazem leitura síncrona antes da inicialização das coleções globais | A interface pode iniciar vazia ou com dados antigos |
| Salvamento principal | `saveAll()` persiste 17 coleções e tenta rollback no próprio localStorage | A gravação pode falhar e o rollback pode falhar pela mesma quota |
| Extensão V9 | `readArr()`, `put()` e `saveExtra()` persistem estoque, movimentações e aprovações separadamente | Pode haver OS/orçamento salvo sem estoque/aprovação, ou o inverso |
| Backup/restauração base | A implementação anterior serializa e grava as categorias e configurações diretamente | Não é compatível com uma camada assíncrona parcial |
| Backup/restauração V9 | Sobrescreve o importador e faz outra sequência de gravações e rollback | Dois fluxos podem divergir e deixar estado parcial |
| CRM | Link de avaliação do Google é lido e gravado diretamente | Configuração pode não acompanhar a migração |
| Exclusão de orçamento | Remove aprovação vinculada diretamente do armazenamento | Pode deixar aprovação órfã ou apagar a referência errada se o cache não estiver sincronizado |
| Verificação de OS | Lê `a2orders` diretamente para comparar o registro persistido com a edição | Pode comparar IndexedDB com cache/localStorage desatualizado |
| Diagnóstico de espaço | Enumera `localStorage.length`, `key()` e valores | A tela de diagnóstico precisa distinguir o armazenamento antigo do novo |

### Implicação para a arquitetura

Não basta migrar apenas `saveAll()`. A camada precisa centralizar todos os acessos de leitura e gravação, inclusive os módulos V9 e os acessos diretos posteriores no HTML. O código usa variáveis globais mutáveis; portanto, a camada de persistência deve sincronizar o estado em memória com as transações do IndexedDB e expor um estado de inicialização/erro claro.

### Bloqueio de implementação segura identificado

O primeiro bloco de script está no `head` e inicializa as coleções globais com leituras síncronas antes da renderização do corpo. Os scripts seguintes dependem dessas variáveis globais e há handlers inline no HTML. Uma migração real exige alterar o bootstrap e a ordem de execução dos scripts, não apenas adicionar uma função `indexedDB.open()`.

**Não foi alterado o código de produção nem o arquivo funcional da aplicação nesta etapa.** Este documento é a especificação de implementação e validação, não uma migração já concluída.
