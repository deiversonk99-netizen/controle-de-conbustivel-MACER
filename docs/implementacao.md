# Sequência de implementação

1. Validar projeto Firebase, autenticação, região, usuários simultâneos e conectividade.
2. Definir perfis por escopo, regras Firestore e testes no emulador.
3. Construir cadastros de ativos, produtos, tanques e medidores.
4. Implementar recebimento e abastecimento atômicos com idempotência.
5. Implementar transferência, estorno, pendências e trilha de auditoria.
6. Implementar fechamento com saldo físico e encerrante separados.
7. Preparar importação local, revisar conflitos e aprovar saldo físico de abertura.
8. Validar offline se necessário, concorrência, falhas de envio e recuperação.
9. Implantar piloto controlado e acompanhar cotas antes de ampliar.

## Regras que não podem ser perdidas

Competência mensal 21–20; hora e quilômetro separados; tanque de distribuição distinto do tanque do motor do comboio; transferência não é consumo; diesel e ARLA separados; correção preserva histórico; cadastro atual não reescreve contexto antigo; pendência de foto não desfaz entrega física.

## Importação

Mapear cabeçalhos por aba: as posições mudam entre produtos e históricos. Resolver duplicidades dos cadastros, classificar recebimentos/transferências e separar saldo anterior de abastecimento mesmo quando estão na mesma linha. Guardar origem e versão do arquivo fora do repositório público. Nunca importar fórmulas e subtotais filtrados como saldo certificado.

Nenhum dado operacional foi importado nesta etapa.
