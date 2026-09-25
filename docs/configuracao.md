# Configuração e homologação

## Projeto real

1. No console Firebase, verificar o projeto indicado em `.firebaserc` e manter o plano Spark conforme a decisão de custo.
2. Habilitar Authentication por e-mail/senha e criar as contas da equipe pelo fluxo confiável do administrador.
3. Criar/verificar Firestore Standard, escolher a região e registrar a decisão antes da importação.
4. Provisionar um documento `users/UID_DA_CONTA` pelo console, com campos `name` (string), `active` (boolean), `role` (`admin`, `manager` ou `operator`) e `siteIds` (array de IDs de unidades, por exemplo `base`). O cliente não pode criar nem promover seu perfil.
5. Publicar regras e índices somente após conferir o projeto e executar a suíte local. Não foram publicados nesta entrega.
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

Versionar código e abrir pull request não publica o site nem altera regras ou dados no Firebase. Contas, região, configuração do projeto e homologação continuam sendo etapas distintas.
