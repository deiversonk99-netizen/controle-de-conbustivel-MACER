# Implantação conferida

## Preparar a origem

O histórico não deve ser inserido como novos abastecimentos: isso baixaria o estoque novamente e misturaria movimentos antigos com a operação atual. O arquivo original permanece intacto. O extrator lê inclusive linhas escondidas por filtros e abas ocultas, usa valores salvos das fórmulas e mantém origem, linha e coluna. Ele não recalcula fórmulas do Excel.

```powershell
python scripts/prepare-import.py "C:/caminho/controle.xlsx" "imports/conferencia.json"
```

O diretório `imports/` está fora do Git. Não publicar a planilha, o pacote ou dados pessoais no repositório. O hash SHA-256 identifica o arquivo original. Quantidade negativa ou data inválida gera linha rejeitada para análise; nenhum ajuste negativo é convertido automaticamente em abastecimento.

## Conferir a unidade e ativar cadastros

O proprietário informa nome da unidade, administrador responsável e e-mail. O acesso inicial do administrador deve ser concedido pelo proprietário do projeto Firebase; um administrador não pode ampliar seu próprio perfil ou promover outros administradores pela aplicação.

No módulo **Implantação / planilha**, abrir o pacote, conferir as abas e selecionar somente as que pertencem à unidade atual. Nenhuma aba é selecionada automaticamente. A unidade fictícia `homologacao` permite a prévia, mas bloqueia a importação de dados da empresa.

As propostas de veículos mostram unidade original, código, placa, modelo e problemas detectados. **Preparar cadastro** preenche dados conhecidos; o responsável deve confirmar código, unidade, propriedade, combustível, capacidade por produto, medidor e leitura inicial. Nenhum veículo é ativado automaticamente a partir do Excel. Resolver códigos repetidos antes de cadastrar. Reservatórios devem ser cadastrados como tanques, conforme sua função operacional; não converter todo destino da planilha em veículo.

Motoristas são cadastrados separadamente dos usuários que fazem os lançamentos. A lista histórica de comboístas não autoriza criar contas ou tratar esses nomes como motoristas sem conferência.

## Importar e consultar o histórico

A importação exige conexão, administrador ativo e autorização para a unidade. O arquivo histórico usa `sites/{unidade}/legacyHistory`; as importações usam `imports`. Gestores e administradores da mesma unidade podem consultar; operadores e visitantes não recebem esse acesso. Os registros são imutáveis, com origem, autor da importação e horário. As regras devem ser publicadas antes de usar o importador.

Lotes de 20 registros são confirmados por transação. Repetir a mesma importação ignora linhas já existentes com valores iguais; valores diferentes na mesma coordenada da origem interrompem o lote e exigem revisão. Lotes já confirmados permanecem salvos se houver interrupção. **Parar após o lote atual** permite retomar. Nunca trocar o identificador para contornar um conflito. Esse identificador considera aba/linha/coluna da planilha de origem; reorganizar linhas ou importar outro livro é uma nova migração e exige reconciliação prévia.

Entradas e saídas preservam sua classificação neutra, porque a planilha inclui transferências, devoluções e destinos que não são veículos. Diesel sem especificação permanece assim; não atribuir S10 ou S500 sem evidência. Leitura, preço e valor originais ficam preservados como texto; não gerar indicadores de consumo com dados não conferidos.

**Carregar / atualizar histórico da planilha** lê todos os registros históricos da unidade, com paginação interna de 300. A tela mostra os primeiros 100 resultados e o CSV contém todos os resultados filtrados. A cópia fica disponível offline no mesmo aparelho/usuário/unidade após carregamento. Evitar atualizações repetidas desnecessárias para preservar a cota de leituras do Firebase.

## Abrir a operação real

Conferir cada tanque: nome, produto, capacidade, mínimo e medição física com data/hora. Cadastrar com saldo zero e registrar **Saldo inicial** somente com a medição validada e sua referência. Se não houver produto, confirmar expressamente saldo zero. O saldo de uma planilha antiga não substitui uma medição atual. A abertura não deve preceder a conferência de movimentos ocorridos entre medição e início de operação.

Depois de cadastrar veículos, motoristas, tanques e operadores: testar recebimento, abastecimento, fechamento e um lançamento offline controlado na unidade real. Todos os aparelhos devem sincronizar antes de fechar o dia. Registrar aprovação da empresa para início de operação.

QR Code, foto obrigatória, SAP e indicadores avançados continuam na evolução futura descrita pelo PDF. A preparação histórica não ativa essas integrações.
