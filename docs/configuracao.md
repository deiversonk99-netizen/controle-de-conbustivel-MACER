# Configuração e homologação

## Projeto real

1. No console Firebase, verificar o projeto indicado em `.firebaserc` e manter o plano Spark conforme a decisão de custo.
2. Habilitar Authentication por e-mail/senha e criar as contas da equipe pelo fluxo confiável do administrador.
3. Criar/verificar Firestore Standard, escolher a região e registrar a decisão antes da importação.
4. Provisionar um documento `users/UID_DA_CONTA` pelo console, com campos `name` (string), `active` (boolean), `role` (`admin`, `manager` ou `operator`) e `siteIds` (array de IDs de unidades, por exemplo `base`). O cliente não pode criar nem promover seu perfil.
5. Publicar regras e índices somente após conferir o projeto e executar a suíte local. Publicados pelo console em 30/09/2026; o índice `operations` com `createdBy ASC` e `createdAt DESC`, escopo coleção, está ativado.
6. Configurar `.env.local` a partir de `.env.example` e testar com contas de cada perfil. A chave web é pública; o controle efetivo está nas regras e identidades.

Administrador cria ativos e tanques. Responsável registra entradas e consulta histórico da unidade. Comboísta abastece e consulta seus lançamentos. Tanques novos começam em zero; abertura histórica e ajustes ainda precisam de fluxo próprio. Não lançar saldo legado como recebimento fictício.

Antes do piloto real: implementar estorno e fechamento; reconciliar cadastros; verificar produto e unidade de medidor por ativo; definir backup e conferir estoque físico. Não migrar a planilha automaticamente.

## Ambiente local isolado

Use `.env.local` com `VITE_FIREBASE_PROJECT_ID=demo-macer`, demais identificadores fictícios preenchidos e `VITE_USE_EMULATORS=true`. API key pode ser `demo-key`, authDomain `demo-macer.firebaseapp.com`, storageBucket `demo-macer.firebasestorage.app`, messagingSenderId `123` e appId `demo-app`.

```sh
npx firebase emulators:start --only firestore,auth --project demo-macer
node scripts/seed-emulator.mjs
npm run dev
```

Executar o seed uma vez em emulador limpo. A conta sintética local é `admin@example.test`, senha `MacerDemo123!`. Não é credencial de produção. O script usa somente endereços fixos loopback e não consulta o projeto real. Emuladores são habilitados no app apenas no modo de desenvolvimento e exigem ID `demo-`.

## Recuperação de envio

Antes de transmitir, a interface conserva comando e UUID no armazenamento local, separados por usuário/unidade. Um envio com resultado incerto bloqueia novos envios naquela tela até recuperar a confirmação. Repetir usa a mesma operação, inclusive após recarregar a página. Falha definitiva permite corrigir os dados. Não é uma fila offline nem garante recuperação se o armazenamento do navegador for apagado; procedimentos para aparelhos compartilhados e backups ainda precisam ser homologados.

## Estado de publicação

O build de produção carrega `.env.production`, versionado com os identificadores públicos do projeto MACER e emuladores desativados. `.env.example` é apenas referência e não é carregado pelo Vite. O desenvolvimento local continua usando `.env.local`. Alterações de configuração exigem novo build e publicação; não modificam uma versão já hospedada. Variáveis definidas pela hospedagem têm precedência: conferir que não apontam para `demo-macer` nem estão vazias.

Em 30/09/2026, a Vercel injetava as seis variáveis Firebase como strings vazias. O SDK agora usa o conjunto completo de identificadores públicos em `src/firebase-public-config.json` quando todas estão ausentes ou vazias. Configuração parcial não é mesclada com o projeto padrão, para evitar misturar projetos. Os valores públicos não concedem acesso administrativo.

Essa configuração permite inicializar o SDK e exibir o login; não habilita Authentication, cria usuários ou publica regras de banco. Não incluir contas de serviço ou senhas em arquivos `VITE_*`.

O PR inicial foi integrado à `main`, e a Vercel publicou o aplicativo. Firestore `(default)` foi criado em São Paulo (`southamerica-east1`), em modo de produção, mantendo o Spark. O login por senha foi ativado e uma conta de teste recebeu perfil `admin` exclusivamente para `homologacao`, com confirmação do proprietário. Regras foram conferidas contra o conteúdo do repositório. O teste online validou cadastro de tanque/ativo, recebimento, abastecimento, horímetro e persistência após recarregar; saldo de 74,4 L. Leitura anônima e fora da unidade foi negada pela API real (403). Conta e senha foram entregues de forma privada ao proprietário, nunca versionadas.

Não foram habilitados backups pagos, Storage, provedores OAuth ou serviços com cobrança. O teste por e-mail/senha na Vercel foi aprovado; domínios OAuth devem ser configurados se esses provedores forem adicionados. CLI local permanece sem autenticação; a configuração desta etapa foi realizada pelo console autenticado.
