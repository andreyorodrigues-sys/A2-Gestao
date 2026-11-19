# Mapa de persistência legada — A2 Gestão

Auditoria feita em `index.html` na branch `native/ios-capacitor-sqlite`. Contagens no arquivo auditado: 70 referências textuais a `localStorage`, 60 ocorrências de `saveAll(` e 13 chamadas explícitas a `setItem(`.

## Pontos que precisam migrar

| Área | Comportamento atual | Migração necessária |
|---|---|---|
| Bootstrap | `a2ReadRaw`, `a2ReadSettings`, `read()` carregam categorias e configurações sincronamente | Substituir por inicialização assíncrona que abre SQLite antes de renderizar os módulos |
| Persistência principal | `saveAll()` grava 17 categorias e tenta rollback no localStorage | Trocar por repositório assíncrono e transação SQLite; só confirmar a ação após commit |
| V9 / estoque | `readArr`, `put`, `saveExtra` leem/gravam estoque, movimentos e aprovações separadamente | Incorporar as 3 categorias adicionais no mesmo snapshot transacional |
| Backup V8 | Exporta snapshot JSON; importação antiga grava chave por chave | Manter exportação compatível e substituir importação por staging + validação + transação SQLite |
| Backup V9 | Sobrescreve `window.a2ImportBackup` e também grava diretamente no localStorage | Remover duplicidade de rotinas; manter um único fluxo de importação |
| Preferências | Período de faturamento, datas, ocultação de valores, modelos WhatsApp, Pix e link Google são acessados como propriedades ou chaves | Persistir em tabela de configurações; centralizar leitura e gravação |
| Fotos de OS | Data URLs/base64 dentro de `a2orders` | Extrair para arquivos privados do app e guardar IDs/caminhos no banco; manter conversão de compatibilidade |
| Diagnóstico | Verifica `localStorage.length`, `key()` e tamanho das chaves | Substituir por diagnóstico de tabelas, tamanho do banco e integridade dos arquivos |
| Aprovações | Bloco de exclusão lê e regrava `a2approvals` diretamente | Usar operação específica do repositório |

## Ordem recomendada

1. Construir camada de repositório com APIs assíncronas e contrato único de dados.
2. Migrar bootstrap para aguardar abertura do banco e carregar um snapshot verificado.
3. Migrar gravações principais e só então adaptar cada módulo para aguardar o commit.
4. Migrar configurações, estoque e aprovações; eliminar todo acesso direto ao localStorage no caminho nativo.
5. Unificar importação/exportação; testar backups reais V2 e V3 com fotos.
6. Extrair fotos para o diretório privado, verificar cada arquivo e testar abertura de fotos após reiniciar o app.
7. Manter a versão web antiga intacta como fallback enquanto o app nativo passa pelos testes.

## Critério de conclusão

A migração não está concluída enquanto houver gravações de dados operacionais somente em localStorage, enquanto qualquer módulo puder exibir sucesso antes da confirmação SQLite, ou enquanto as fotos não forem verificadas após reinicialização do aplicativo.
