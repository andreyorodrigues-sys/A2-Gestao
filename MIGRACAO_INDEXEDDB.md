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
