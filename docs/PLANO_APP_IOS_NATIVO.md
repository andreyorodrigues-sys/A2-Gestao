# A2 Gestão — migração para aplicativo iOS nativo

## Estado da auditoria

- Base auditada: branch `main`, commit `0aa025c1015ea355cd475f6c9a4dc669c17c3d0e`.
- Branch isolada de trabalho: `native/ios-capacitor-sqlite`.
- O repositório contém um único `index.html` ativo (aprox. 456 KB) e arquivos HTML de backup. Não há `package.json`, projeto Xcode, configuração Capacitor, manifesto PWA ou estrutura modular de frontend no diretório raiz.
- A interface é HTML/CSS/JavaScript com múltiplos blocos de scripts inline.
- O aplicativo lê e grava dados diretamente em `localStorage`. O código também usa atribuições diretas como `localStorage.a2RevenuePeriod`, além de `getItem`, `setItem`, `removeItem`, `length` e `key`.
- Há pelo menos 17 categorias principais de dados, 7 categorias de configuração e 3 categorias adicionais do V9: estoque, movimentações de estoque e aprovações.
- Fotos de vistoria são comprimidas no cliente e armazenadas como strings Data URL/base64 dentro dos registros das OS. O código usa FileReader, Canvas e inputs de arquivo com captura de câmera.
- Backup atual é JSON com checksum e imagens embutidas. A restauração grava várias chaves sequencialmente no localStorage e tenta rollback. A segunda rotina V9 de importação substitui a primeira e também grava diretamente no localStorage. Isso explica por que a versão atual ainda pode exceder a cota do WebKit, mesmo após a correção emergencial de cópias redundantes.
- Exportação PDF/CSV, WhatsApp, câmera, formulários, histórico e módulos financeiros estão ligados diretamente ao DOM e APIs do navegador.

## Diagnóstico

Não é seguro simplesmente adicionar Capacitor e gerar um ícone. A camada de persistência precisa ser substituída e testada antes de considerar a migração pronta. O uso de SQLite no iOS precisa ser integrado ao ciclo de inicialização e aos fluxos de gravação; o app só deve informar que salvou depois de confirmar a persistência.

## Arquitetura-alvo a validar

1. Capacitor como contêiner iOS e ponte para recursos nativos, reaproveitando inicialmente a interface atual para reduzir mudanças visuais.
2. SQLite local no dispositivo como fonte oficial dos dados estruturados, com migrações de esquema versionadas e transações.
3. Fotos armazenadas como arquivos no diretório privado do aplicativo; o banco guarda identificadores/caminhos e metadados. Evitar manter fotos grandes em base64 duplicadas no JSON e no banco.
4. Camada única de repositório para clientes, veículos, serviços, orçamentos, agenda, OS, histórico, financeiro, CRM, estoque, aprovações e configurações. Eliminar acessos diretos a localStorage dos módulos.
5. Migração inicial: ler o backup JSON V2/V3 existente, validar checksum e categorias, copiar registros e fotos para o armazenamento nativo, conferir contagens e integridade, e só então marcar a migração como concluída. Não apagar nem sobrescrever a fonte antiga durante a migração.
6. Backup manual compatível: exportar um pacote versionado contendo dados e fotos; restaurar primeiro em área temporária, validar checksum e vínculos e depois substituir dados numa transação/etapa atômica. Manter compatibilidade de importação com os JSON antigos.
7. Testes de regressão para cadastro, edição, exclusão, OS, checklist/fotos, orçamento/PDF, recebimentos, despesas, CRM, estoque, exportação e restauração.

## Etapas de implementação

- [ ] Criar base de projeto Capacitor e configuração iOS sem tocar na produção.
- [ ] Implementar e validar SQLite + repositório e migrações.
- [ ] Migrar persistência e referências de fotos.
- [ ] Adaptar backup/restauração e testar os backups V2/V3 existentes.
- [ ] Testar os fluxos funcionais completos em simulador e iPhone físico.
- [ ] Configurar assinatura Apple e gerar build instalável para distribuição privada/TestFlight.
- [ ] Só após aceite explícito, planejar eventual substituição da versão web.

## Bloqueios e limites conhecidos

- Este repositório ainda não tem projeto iOS nem pipeline de build iOS.
- Para gerar e instalar um app iOS assinado será necessário configurar assinatura Apple e executar uma compilação iOS por Xcode em Mac ou serviço de build compatível. O acesso ao repositório, por si só, não fornece certificado, perfil de provisionamento nem autorização de distribuição.
- Nenhuma alteração foi feita na branch `main` ou no deployment de produção durante esta auditoria.
