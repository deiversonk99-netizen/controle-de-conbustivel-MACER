# Arquitetura Firebase

Decisão: Firestore como banco único; Authentication para identidade; React/TypeScript para interface. O identificador do projeto mantém a grafia fornecida pelo proprietário. Sem Sheets e sem banco SQL.

## Coleções implementadas

`users/{uid}` contém nome, perfil, ativo e unidades autorizadas. Sob `sites/{siteId}` ficam `assets`, `tanks` e `operations`. Nesta etapa `operations` é o próprio livro de movimentos imutáveis (recebimento/abastecimento), evitando uma cópia redundante em `stockMovements`. `tanks.balanceMl` é a projeção atual do saldo. Leituras correntes ficam no ativo e cada abastecimento preserva sua leitura no movimento.

Recebimento exige responsável/administrador. Abastecimento exige perfil ativo no escopo. A transação lê operação, tanque e ativo antes de escrever. As regras exigem vínculo com a nova operação tanto no saldo quanto na leitura. Não é possível editar o histórico, reaplicar uma operação antiga, gravar saída sem medidor ou alterar o saldo isoladamente. Campos quantitativos são inteiros escalados em milésimos. Timestamps de registro precisam coincidir com o horário do servidor.

O provisionamento de usuários permanece fora do cliente. O UUID e o comando são persistidos localmente antes do envio para recuperação, mas operações offline e retroativas ainda não estão habilitadas.

## Modelo futuro proposto

- `users`: perfil ativo e escopos de operação, administrados por acesso confiável.
- `assets`: equipamentos, código, placa opcional, situação e medidores.
- `products`: produtos e unidades, separando diesel e ARLA.
- `stockPoints`: tanques fixos/móveis, capacidade e escopo.
- `operations`: comandos identificados por UUID, data do fato, autor e conferência.
- `stockMovements`: movimentos imutáveis vinculados à operação.
- `balances`: saldo materializado por ponto/produto, reconstruível dos movimentos.
- `readings`: leituras com tipo/unidade, instrumento e data do fato.
- `closures`: fechamento por ponto/produto/data, medição física, versão e aprovação.
- `auditEvents`: alterações e motivos sem exclusão operacional.
- `importBatches`: origem, estado da revisão e rastreabilidade da migração.

Essas coleções são um desenho proposto, não existem automaticamente ao inicializar o SDK.

## Integridade no plano Spark

Não confiar somente nas validações da interface. Clientes podem chamar a API diretamente. Regras Firestore deverão validar autorização, campos permitidos, tipos, valores, produto e estado do ativo. Não permitir que o cliente escolha seu próprio perfil.

Para estoque, transação deve ler o saldo atualizado e gravar operação, movimento e saldo juntos. Regras com `getAfter` devem exigir os documentos relacionados, a identidade da operação e a variação exata. UUID existente impede reaplicação. Transferência exige ambos os lados. Limites de acessos das regras devem ser testados no Emulator Suite.

Antes de abrir qualquer escrita, testar requisições maliciosas: alteração isolada do saldo, ausência do movimento, duas saídas sobre o mesmo saldo, troca de escopo, alteração de autor, edição e exclusão de histórico. Se uma regra ficar inviável no cliente/Security Rules, rever a arquitetura e a restrição de custo antes de depender de servidor com credencial Admin. Cloud Functions não é pressuposto do plano Spark.

Quantidades podem ser inteiros em mililitros, leituras em escala definida e valores em centavos com política de arredondamento. Preservar preço unitário com precisão própria. Saldo oficial nunca depende dos filtros da tela.

## Offline e custo

Transações Firestore falham offline. A futura fila local representa registros pendentes, nunca confirmação de estoque no servidor. Reenvio usa o mesmo UUID. Conflitos e fatos retroativos precisam de conferência. Não habilitar cache persistente de dados operacionais sem considerar aparelhos compartilhados.

Consultas devem ser paginadas e restritas ao escopo. Evitar listeners globais do histórico. Estabelecer orçamento de leituras/gravações, anexos e plano de backup antes do piloto.

## Documentação oficial

- [Transações](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Security Rules e getAfter](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Cotas gratuitas](https://firebase.google.com/docs/firestore/quotas)
- [Requisitos do Storage](https://firebase.google.com/docs/storage/faq-and-troubleshooting)
