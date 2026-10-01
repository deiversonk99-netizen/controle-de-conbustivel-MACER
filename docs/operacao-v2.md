# Operação, funcionamento offline e implantação

## Entrega implementada

O escopo principal do PDF foi transportado de AppSheet para React e Firestore. A planilha orientou as regras de negócio, mas não é banco de dados nem foi importada automaticamente.

| Área | Implementação |
|---|---|
| Acesso | Login por e-mail/senha; perfil ativo; isolamento por unidade |
| Motoristas | Cadastro, edição e inativação com auditoria; separado do usuário comboísta |
| Ativos | Código, placa, tipo, modelo, proprietário, próprio/terceiro, capacidades por produto e medidor h/km |
| Apontamento | Data de captura e confirmação separadas, litros, leitura, motorista, NF/referência, preço, total, observação e foto opcional |
| Estoque | Recebimento, abastecimento, transferência entre tanques e saldo inicial com transações atômicas |
| Conferência | Registrado/validado/pendente/cancelado; cancelamento por estorno, sem apagar o original |
| Pendências | Fila local, envio ao responsável, correção com novo protocolo ou rejeição justificada; original preservado |
| Fechamento | Saldo inicial, entradas/saídas, calculado, físico, diferença e bloqueio do dia fechado |
| Histórico | Paginação, filtros de datas, veículo, autor, status e competência 21–20; CSV compatível com Excel |
| Administração | Cadastro/liberação/inativação de comboístas e responsáveis na unidade do administrador; auditoria de perfis |
| Offline | Service worker, IndexedDB, sessão já autenticada, fila por conta/unidade e reconciliação online |

## Uso sem internet

1. Abrir o app com internet, entrar e aguardar “Aplicação disponível offline” e a data de preparação dos cadastros.
2. Usar o mesmo navegador/perfil. A sessão permanece neste aparelho. O primeiro login e novos cadastros exigem internet.
3. Sem conexão, os lançamentos são guardados no IndexedDB e recebem protocolo antes de qualquer envio. O saldo mostrado é a última consulta, não uma reserva garantida.
4. Ao voltar a internet com o app aberto, a fila é processada em ordem. O servidor revalida permissões, leitura, produto, capacidade, dia e estoque.
5. Em caso de inconsistência, o lançamento permanece disponível em Pendências. Um responsável trata a ocorrência com justificativa. A correção recebe outro protocolo e não modifica o original.
6. Não apagar dados do navegador nem trocar de aparelho antes de sincronizar. Há exportação da fila em JSON para cópia local. Uma conta não envia a fila de outra conta.

O navegador pode suspender páginas fechadas: não se promete envio em segundo plano com o app encerrado. Ao reabrir conectado, o processamento continua. Os dados locais persistem após recarregar, mas a limpeza de armazenamento pelo usuário/sistema pode removê-los. Fotos opcionais são compactadas (até 160.000 caracteres de JPEG) e mantidas em documento separado; não são armazenamento ilimitado.

## Regras operacionais adotadas

- NF/referência é opcional no abastecimento e obrigatória em recebimento, transferência, saldo inicial e estorno. Preço pode ser zero quando não informado; total calculado em centavos, litros e leitura em milésimos.
- Captura automática usa o relógio do aparelho; a confirmação usa o relógio do Firestore. Data operacional em America/Sao_Paulo (UTC−3); janela de sincronização de 30 dias, tolerância futura de cinco minutos. Fora dela, o responsável precisa tratar a pendência.
- Fechamento é do dia corrente. Conferir todas as filas antes de fechar. Um apontamento anterior ao fechamento não altera silenciosamente o saldo: o responsável preserva a captura original na pendência e pode lançar a correção na data atual, com motivo.
- Transferências exigem tanques do mesmo produto. Diesel e ARLA ficam separados. Capacidades por produto pertencem ao ativo; leitura é do medidor cadastrado.
- Estornos de abastecimentos seguem a ordem inversa de confirmação para restaurar leituras. Registros legados da primeira versão não têm a leitura anterior necessária ao estorno automático e exigem migração/conferência específica; permanecem visíveis no histórico.
- Tanques novos começam zerados; saldo inicial é um movimento exclusivo do administrador antes de qualquer movimentação. Editar cadastro não permite alterar saldo nem leitura atual.
- Usuários novos recebem apenas operador/responsável e uma unidade já autorizada ao administrador. Criação do Authentication usa uma instância temporária em memória e preserva a sessão administrativa. Falha entre Auth e perfil mostra o UID para concluir a liberação sem duplicar a conta. Administração de administradores e perfis de múltiplas unidades permanece com o proprietário no console.

## Implantação coordenada

Publicar as regras e índices deste commit antes de disponibilizar o novo cliente. A nova interface usa coleções que a versão anterior das regras bloqueia. A atualização continua exigindo perfil ativo e unidade autorizada; não oferece acesso anônimo. A alteração de permissões de administração deve ser aprovada antes da publicação pelo console.

1. Executar `npm ci`, `npm test`, `npm run build` e `npm run test:integration` (Java 21).
2. Publicar `firestore.rules` e `firestore.indexes.json` no projeto existente, sem ativar faturamento.
3. Publicar a branch revisada em `main`; a Vercel faz o build de produção. Nunca publicar o diretório gerado pelo modo `e2e`.
4. Validar login e um ciclo de teste somente na unidade homologacao, com identificação de dados fictícios.
5. Para atualizar o service worker, fechar todas as abas do app e reabrir conectado. O worker não interrompe um formulário em andamento.

## Base real e evolução

A migração da planilha permanece separada: resolver duplicidades de códigos, medidores divergentes, proprietários/capacidades ausentes e leitura inicial antes de importar. Não assumir que uma célula de saldo corresponde à medição física atual. Os arquivos originais e credenciais não pertencem ao repositório.

QR Code, foto obrigatória, dashboard gerencial avançado, consumo por h/km e SAP são melhorias futuras identificadas no PDF. Não há integração SAP definida. O plano Spark tem cotas: o histórico é paginado e anexos são opcionais, mas a operação não é ilimitada. Em crescimento significativo, medir leituras, armazenamento e concorrência antes de expandir.

## Evidências de teste

Testes unitários cobrem quantidades, competência, dinheiro, fila idempotente, falhas de rede, anexos e isolamento do armazenamento. Testes no emulador verificam permissões, transações, concorrência, auditoria, estorno, fechamento e pendências. O teste de navegador usa 390 × 844 px, cadastra motorista, lança sem internet, recarrega offline, reconecta e confere uma única baixa no estoque. Capturas são geradas em `test-results/` e não são versionadas.
