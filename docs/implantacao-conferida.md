# Implantação conferida

## Preparar a origem

O histórico não deve ser inserido como novos abastecimentos: isso baixaria o estoque novamente e misturaria movimentos antigos com a operação atual. O arquivo original permanece intacto. O extrator lê inclusive linhas escondidas por filtros e abas ocultas, usa valores salvos das fórmulas e mantém origem, linha e coluna. Ele não recalcula fórmulas do Excel.

```powershell
python scripts/prepare-import.py "C:/caminho/controle.xlsx" "imports/conferencia.json"
```

O diretório `imports/` está fora do Git. Não publicar a planilha, o pacote ou dados pessoais no repositório. O hash SHA-256 identifica o arquivo original. Quantidade negativa ou data inválida gera linha rejeitada para análise; nenhum ajuste negativo é convertido automaticamente em abastecimento.

## Conferir a unidade e ativar cadastros

Todos os dados operacionais são preenchidos no módulo **Preparar unidade** do aplicativo: nome da unidade/obra, CRs, nome e e-mail do responsável, conferência dos cadastros e medição física dos tanques. Não é necessário encaminhar esses dados por conversa.

A habilitação inicial de uma conta pessoal de administrador principal deve ser feita pelo proprietário do projeto Firebase. Somente essa conta recebe `canCreateSites: true`; a conta pública de teste permanece restrita a `homologacao`. O principal pode criar uma unidade nova no aplicativo e receber acesso apenas à unidade criada nessa mesma transação. Não pode acrescentar unidades existentes ao seu perfil nem promover outros administradores pelo app. O primeiro CR determina o código interno da unidade; os demais CRs são associados à mesma unidade. Nome e responsável podem ser atualizados com auditoria. Cadastrar o responsável não cria seu login: use **Usuários** para liberar um gestor ou operador.

Em **Preparar unidade**, os atalhos levam aos veículos, motoristas e usuários. Depois da verificação presencial, marcar as três conferências e salvar. Essas marcações registram a declaração do administrador; não substituem a conferência dos dados pela empresa e não bloqueiam automaticamente a operação.

No módulo **Implantação / planilha**, abrir o pacote, conferir as abas e selecionar os CRs originais dos registros que pertencem à unidade atual. Abas e CRs começam desmarcados. CR ausente ou com erro deve ser conferido na origem antes de seleção; a amostra é limitada às primeiras 100 linhas, e não substitui a conferência do arquivo completo. A unidade fictícia `homologacao` permite a prévia, mas bloqueia a importação de dados da empresa.

As propostas de veículos mostram unidade original, código, placa, modelo e problemas detectados. **Preparar cadastro** preenche dados conhecidos; o responsável deve confirmar código, unidade, propriedade, combustível, capacidade por produto, medidor e leitura inicial. Nenhum veículo é ativado automaticamente a partir do Excel. Resolver códigos repetidos antes de cadastrar. Reservatórios devem ser cadastrados como tanques, conforme sua função operacional; não converter todo destino da planilha em veículo.

Motoristas são cadastrados separadamente dos usuários que fazem os lançamentos. A identificação da pessoa e o cabeçalho original da coluna ficam preservados: as abas de 2026 usam “MOT.” e as antigas usam “COMBOISTA”. Essa lista não autoriza criar contas ou atribuir papéis às pessoas sem conferência.

## Importar e consultar o histórico

A importação exige conexão, administrador ativo e autorização para a unidade. O arquivo histórico usa `sites/{unidade}/legacyHistory`; as importações usam `imports`. Gestores e administradores da mesma unidade podem consultar; operadores e visitantes não recebem esse acesso. Os registros são imutáveis, com origem, autor da importação e horário. As regras devem ser publicadas antes de usar o importador.

Lotes de 20 registros são confirmados por transação. Repetir a mesma importação ignora linhas já existentes com valores iguais; valores diferentes na mesma coordenada da origem interrompem o lote e exigem revisão. Lotes já confirmados permanecem salvos se houver interrupção. **Parar após o lote atual** permite retomar. Nunca trocar o identificador para contornar um conflito. Esse identificador considera aba/linha/coluna da planilha de origem; reorganizar linhas ou importar outro livro é uma nova migração e exige reconciliação prévia.

Entradas e saídas preservam sua classificação neutra, porque a planilha inclui transferências, devoluções e destinos que não são veículos. Diesel sem especificação permanece assim; não atribuir S10 ou S500 sem evidência. Leitura, preço e valor originais ficam preservados como texto; não gerar indicadores de consumo com dados não conferidos.

**Carregar / atualizar histórico da planilha** lê todos os registros históricos da unidade, com paginação interna de 300. A tela mostra os primeiros 100 resultados e o CSV contém todos os resultados filtrados. A cópia fica disponível offline no mesmo aparelho/usuário/unidade após carregamento. Evitar atualizações repetidas desnecessárias para preservar a cota de leituras do Firebase.

## Abrir a operação real

Em **Preparar unidade**, cadastrar cada tanque com nome, produto, capacidade e mínimo. O cadastro começa com saldo zero. Informar saldo físico em litros, data/hora em Brasília, quem mediu e referência/método; a medição deve estar dentro dos últimos 30 dias e não pode exceder a capacidade. O registro é imutável e não altera o estoque por si só.

Para um tanque novo, confirmar que não houve entradas/saídas posteriores à medição e tocar em **Definir saldo inicial**. A abertura usa exatamente a quantidade medida e fica vinculada à medição. Repetir o envio não repete a entrada; a transação impede uma segunda abertura. Saldo físico zero também exige confirmação e encerra a abertura sem criar um movimento de entrada fictício. Se a medição estiver errada, registrar outra; nunca editar o histórico. Se o tanque já tiver movimentos, usar **Fechamento** para conferir diferenças. O saldo de uma planilha antiga não substitui uma medição atual.

A preparação requer internet. As informações já carregadas podem ser consultadas offline no mesmo aparelho/usuário/unidade. Abastecimentos continuam usando a fila offline; dados operacionais devem ser cadastrados e sincronizados antes do trabalho em campo.

Depois de cadastrar veículos, motoristas, tanques e operadores: testar recebimento, abastecimento, fechamento e um lançamento offline controlado na unidade real. Todos os aparelhos devem sincronizar antes de fechar o dia. Registrar aprovação da empresa para início de operação.

QR Code, foto obrigatória, SAP e indicadores avançados continuam na evolução futura descrita pelo PDF. A preparação histórica não ativa essas integrações.
