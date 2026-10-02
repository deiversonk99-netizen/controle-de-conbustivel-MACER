# Revisão para uso — 01/10/2026

## Conferência com o PDF

| Requisito do documento | Implementação e conferência |
|---|---|
| Login e perfis | Login mantido; perfis ativos com acesso limitado à unidade; permissões verificadas no servidor. |
| Página inicial e registros do dia | Resumo, acesso direto a novo abastecimento, histórico e estoque; resumo informa quando há somente parte do histórico carregada. |
| Cadastros | Veículos/equipamentos com código, placa, tipo, modelo, proprietário, locação, capacidade por produto, medidor e situação; motoristas separados dos usuários; tanques e usuários. |
| Abastecimento | Data/hora e autor automáticos; pesquisa por código/placa; motorista; leitura, litros, preço, total, referência, observação e foto opcional. Conferência antes da gravação. |
| Validações | Quantidade positiva, cadastro ativo, capacidade e leitura; validação inicial no formulário e revalidação transacional no servidor. |
| Duplicidade | Cada lançamento salvo recebe identificador estável; repetir envio não repete a baixa. Não identifica automaticamente dois apontamentos manuais distintos de um mesmo abastecimento. |
| Rastreabilidade | Movimentos imutáveis; correções/estornos e alterações de cadastro com autor, horário, motivo, antes/depois. |
| Estoque | Saldo pelos movimentos, entrada, saída, transferência, abertura, capacidade e alerta de mínimo; diesel/ARLA separados. |
| Fechamento | Inicial, entradas, saídas, calculado, físico, diferença, situação e bloqueio do dia fechado. Conferir filas de todos os aparelhos antes de fechar. |
| Pendências | Falhas de negócio preservadas; responsável corrige ou rejeita com motivo; contagem inclui pendências recebidas de outros aparelhos. |
| Histórico/relatórios | Filtros, paginação, competência 21–20, exportação CSV para Excel; histórico recente e conferências atualizados enquanto conectado. |
| Uso offline solicitado | Aplicação em cache, perfil/cadastros locais e fila IndexedDB por usuário/unidade; envio automático com app aberto; conflitos não alteram saldo. |

## Orientação simples para a equipe

1. **Antes de sair:** entrar com internet, tocar em **Sincronizar / atualizar**, conferir os cadastros e aguardar **Aplicação disponível offline**.
2. **Abastecer:** tocar em **Novo abastecimento**, escolher tanque e veículo, informar a leitura atual e os litros. Conferir a capacidade e a última leitura mostradas na tela.
3. **Conferir:** tocar em **Conferir lançamento**. Se algo estiver errado, usar **Voltar e corrigir**; caso contrário, **Confirmar e salvar**.
4. **Sem internet:** a mensagem **Salvo neste aparelho** confirma apenas a gravação local. Não lançar novamente e não apagar os dados do navegador.
5. **Voltou a conexão:** manter o aplicativo aberto. Em **Pendências**, aguardar **Confirmado**. Se aparecer **Conferência necessária**, chamar o responsável.
6. **Fechar o dia:** responsável confirma que todos os aparelhos enviaram os registros, mede o estoque físico e informa a diferença/justificativa quando houver.

O aplicativo avisa ao tentar abandonar um abastecimento em preenchimento. Esse aviso não substitui a confirmação: um formulário não confirmado ainda não está na fila. Evitar navegação anônima. O primeiro login e novos cadastros precisam de internet. Não há garantia de envio enquanto o aplicativo estiver fechado.

## Preparação da operação real

O ambiente publicado contém a unidade de homologação e dados fictícios. Para iniciar operação real, o proprietário precisa informar unidades, responsáveis, veículos, capacidades, leituras iniciais e medição física de cada tanque. A capacidade de 5.000 L citada no PDF é configurável, não um saldo inicial presumido.

A planilha histórica exige conferência de duplicidades de código e leituras divergentes antes de importação. Não foram criados saldos operacionais com base em células não conferidas. Registros legados sem leitura anterior não têm estorno automático.

QR Code, foto obrigatória, indicadores avançados de consumo e SAP estão explicitamente na evolução futura do PDF. Não há integração SAP nesta versão. O banco segue sujeito às cotas do plano gratuito.

## Verificação da revisão

O teste de navegador cobre celular de 390 px, criação de motorista, rejeição de leitura regressiva e litros acima da capacidade, retorno da conferência sem perder campos, aviso ao abandonar formulário, gravação offline, recarga da página sem rede, reconexão sem duplicar baixa, conflito com leitura mais recente no servidor preservado sem débito e cadastro de usuário sem perder a sessão administrativa. As regras de acesso e estoque são verificadas no emulador, sem dados reais.
