# Conferência de escopo — PDF e planilha MACER

Fontes: Projeto_AppSheet_Controle_de_Combustivel_Macer.pdf (5 páginas) e planilha atualizada até 13/09/2026. A tecnologia definida pelo proprietário é React/Firebase, substituindo AppSheet e Google Sheets.

## Requisitos do PDF

- Identificação do usuário, perfis comboísta/responsável/administrador e escopo por unidade.
- Resumo do dia, abastecimento, registros do dia, histórico por veículo, recebimentos, estoque, fechamento, pendências e administração.
- Ativo: código, placa, tipo, modelo, proprietário, próprio/terceiro, capacidade, leitura e ativo/inativo.
- Abastecimento: hora capturada, hora recebida pelo servidor, autor, ativo, leitura, litros, produto, NF/referência, preço unitário, valor total, observação, comprovação e status.
- Validação de leitura crescente, litros positivos, capacidade, cadastro ativo, duplicação e auditoria de alterações.
- Estoque por movimentos, limite mínimo, saldo físico, diferença e fechamento diário.
- Filtros por período, veículo, comboísta e status; histórico completo e exportação compatível com Excel.
- QR, fotografia obrigatória, dashboard avançado e SAP aparecem como melhorias futuras. Nenhuma integração SAP foi definida ou autorizada.

## Particularidades da planilha

- Diesel e ARLA devem ter estoques distintos. Um veículo pode utilizar ambos.
- Horímetro e hodômetro não podem ser misturados. O medidor e a unidade devem acompanhar cada leitura.
- Existem transferências/devoluções entre reservatórios: não são consumo do veículo.
- Competência operacional de 21 a 20, distinta do mês civil.
- CADASTRO e CAD PLACAS contêm duplicidades e códigos divergentes. A migração requer conferência; não deduzir placas, capacidade ou leitura.
- Os saldos documentais por reservatório não equivalem a estoque físico certificado nem devem virar recebimentos fictícios. Os valores da fonte foram mantidos somente na análise local, fora do repositório.

## Critérios offline

- Primeiro acesso online; sessão e cadastros preparados no aparelho.
- Instalação PWA/cache da aplicação e fila durável por usuário/unidade.
- Toda inclusão recebe UUID antes do envio. Confirmar no servidor antes de marcar sincronizado.
- Falhas de rede permanecem na fila. Falhas de negócio ficam como pendências, com motivo e dados preservados.
- Nunca prometer estoque definitivo sem reconciliação. Transações revalidam saldo, cadastro e leitura ao sincronizar.
- Não sincronizar dados de outra conta. Não permitir saída silenciosa enquanto houver pendências locais.
- Sem internet, relógio do aparelho registra a captura; servidor registra a confirmação separadamente. Não atribuir ao relógio local a garantia de horário do servidor.

## Custo e fotos

Manter Spark e não ativar serviços pagos. Comprovação opcional em imagem compactada pode usar documento separado no Firestore, com limite rígido e exclusão de indexação do conteúdo. Isso consome a cota de armazenamento; não se trata de repositório ilimitado de imagens. Importação da base real é separada da implementação e deve apresentar prévia e divergências antes de gravar.
